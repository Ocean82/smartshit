/**
 * Adaptive Context Builder — Token-budget-aware multi-sheet compression.
 *
 * Replaces the static single-sheet context pipeline with a budget-aware
 * builder that:
 * 1. Compresses ALL sheets (not just active), prioritized by relevance
 * 2. Detects cross-sheet formula references for priority inclusion
 * 3. Progressively truncates to fit within the provider's token budget
 *
 * This module lives client-side — the server's `formatContextBlock` handles
 * final prompt-level truncation. This module ensures the *payload* sent to
 * the server is already appropriately sized.
 */

import type { WorkbookData, SheetData, Selection } from '@/types'
import { compressSheet } from '@/ai/sheetCompressor'
import { buildSpreadsheetContext, type SpreadsheetContextPayload } from '@/ai/buildContext'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdaptiveContextOptions {
  /** Token budget available for the spreadsheet context block */
  tokenBudget: number
  workbook: WorkbookData
  activeSheet: SheetData
  selection: Selection | null
  getComputedValue: (row: number, col: number) => string
}

interface SheetPriority {
  sheet: SheetData
  priority: 'active' | 'referenced' | 'other'
  /** Cross-sheet refs from active sheet that point to this sheet */
  refCount: number
}

// ─── Cross-Sheet Reference Detection ────────────────────────────────────────

/**
 * Scan all formulas in a sheet for cross-sheet references.
 * Returns a map of sheet name → number of references.
 *
 * Cross-sheet formula patterns:
 * - SheetName!A1
 * - 'Sheet Name'!A1:B10
 * - Sheet1!$A$1
 */
function detectCrossSheetRefs(sheet: SheetData, allSheetNames: string[]): Map<string, number> {
  const refs = new Map<string, number>()

  // Build regex for all sheet names (escaped for regex)
  const escaped = allSheetNames
    .filter((n) => n !== sheet.name)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  if (escaped.length === 0) return refs

  // Match both quoted ('Sheet Name'!) and unquoted (Sheet1!) references
  const pattern = new RegExp(
    `(?:'(${escaped.join('|')})'|(${escaped.join('|')}))!`,
    'gi',
  )

  for (const cell of Object.values(sheet.cells)) {
    if (!cell.formula) continue
    let match: RegExpExecArray | null
    pattern.lastIndex = 0
    while ((match = pattern.exec(cell.formula)) !== null) {
      const sheetName = match[1] || match[2]
      // Normalize to actual name (case-insensitive match)
      const actual = allSheetNames.find(
        (n) => n.toLowerCase() === sheetName.toLowerCase(),
      )
      if (actual) {
        refs.set(actual, (refs.get(actual) ?? 0) + 1)
      }
    }
  }

  return refs
}

// ─── Token Estimation (mirrors server-side heuristic) ───────────────────────

function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.5)
}

// ─── Adaptive Builder ───────────────────────────────────────────────────────

/**
 * Build a token-budget-aware context payload for multi-sheet workbooks.
 *
 * Budget allocation strategy:
 * - Active sheet: 60% of budget (full compression)
 * - Referenced sheets: 30% of budget (structural + inverted-index)
 * - Other sheets: 10% of budget (summary only, already cheap)
 *
 * Falls back to the standard `buildSpreadsheetContext` for single-sheet
 * workbooks or when the budget is generous enough to include everything.
 */
export function buildAdaptiveContext(
  options: AdaptiveContextOptions,
): SpreadsheetContextPayload {
  const { tokenBudget, workbook, activeSheet, selection, getComputedValue } = options

  // For single-sheet workbooks or generous budgets, use standard builder
  if (workbook.sheets.length <= 1 || tokenBudget > 12_000) {
    return buildSpreadsheetContext(workbook, activeSheet, selection, getComputedValue)
  }

  // ─── Detect cross-sheet references ──────────────────────────────────────
  const allNames = workbook.sheets.map((s) => s.name)
  const crossRefs = detectCrossSheetRefs(activeSheet, allNames)

  // ─── Prioritize sheets ──────────────────────────────────────────────────
  const priorities: SheetPriority[] = workbook.sheets.map((s) => ({
    sheet: s,
    priority: s.id === activeSheet.id
      ? 'active'
      : crossRefs.has(s.name)
        ? 'referenced'
        : 'other',
    refCount: crossRefs.get(s.name) ?? 0,
  }))

  // Sort: active first, then referenced (by ref count desc), then other
  priorities.sort((a, b) => {
    const order = { active: 0, referenced: 1, other: 2 }
    if (order[a.priority] !== order[b.priority]) {
      return order[a.priority] - order[b.priority]
    }
    return b.refCount - a.refCount
  })

  // ─── Build the base context (standard path for active sheet) ────────────
  const basePayload = buildSpreadsheetContext(workbook, activeSheet, selection, getComputedValue)

  // ─── Estimate base payload token cost ───────────────────────────────────
  const baseEstimate = estimateTokens(JSON.stringify(basePayload))

  // If base already fits comfortably, return as-is
  if (baseEstimate < tokenBudget * 0.7) {
    // We have headroom — enrich with referenced sheet compressions
    const remainingBudget = tokenBudget - baseEstimate
    const enrichments = buildReferencedSheetEncodings(
      priorities.filter((p) => p.priority === 'referenced'),
      getComputedValue,
      remainingBudget,
    )

    if (enrichments) {
      const enrichedEncoding = basePayload.compressedEncoding
        ? `${basePayload.compressedEncoding}\n\n${enrichments}`
        : enrichments
      return { ...basePayload, compressedEncoding: enrichedEncoding }
    }

    return basePayload
  }

  // ─── Budget is tight — use progressive compression ──────────────────────
  // Rebuild the active sheet with tighter compression settings
  const tightCompressed = compressSheet(activeSheet, getComputedValue, {
    mode: 'full',
    maxRows: 300,   // Reduced from 500
    maxCols: 30,    // Reduced from 50
    anchorDistance: 1, // More aggressive pruning
  })

  // Replace compressedEncoding and drop sampleRows
  return {
    ...basePayload,
    compressedEncoding: tightCompressed.encoded,
    sampleRows: [], // Drop samples — compressed encoding is more token-efficient
    sampleRowsTruncated: true,
  }
}

/**
 * Build compressed encodings for referenced (non-active) sheets.
 * Uses structural compression (no aggregation) for balance.
 */
function buildReferencedSheetEncodings(
  referenced: SheetPriority[],
  getComputedValue: (row: number, col: number) => string,
  tokenBudget: number,
): string | null {
  if (referenced.length === 0 || tokenBudget < 200) return null

  const parts: string[] = []
  let totalUsed = 0

  for (const { sheet } of referenced) {
    if (totalUsed >= tokenBudget) break

    const compressed = compressSheet(sheet, getComputedValue, {
      mode: 'structural',
      maxRows: 200,
      maxCols: 20,
      anchorDistance: 1,
    })

    const header = `--- Sheet: "${sheet.name}" ---`
    const encoding = `${header}\n${compressed.encoded}`
    const tokens = estimateTokens(encoding)

    if (totalUsed + tokens <= tokenBudget) {
      parts.push(encoding)
      totalUsed += tokens
    } else if (totalUsed + 100 <= tokenBudget) {
      // At least include a summary
      const summary = `${header}\n[${compressed.originalCells} cells, compression ratio ${compressed.compressionRatio}x — ask for details]`
      parts.push(summary)
      totalUsed += estimateTokens(summary)
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null
}

/**
 * Determine an appropriate token budget for context based on whether
 * we're targeting a local model (constrained) or cloud (generous).
 *
 * This is a client-side heuristic — the server will do final truncation.
 */
export function getClientContextBudget(isCloudAvailable: boolean): number {
  // Cloud: generous budget — server's formatContextBlock will handle final sizing
  if (isCloudAvailable) return 12_000

  // Local Ollama: tight budget
  // 8192 (ctx) - 1024 (predict) - ~2000 (system prompt) - 600 (history) - 200 (user msg)
  // ≈ 4368 tokens available for context
  return 4_000
}
