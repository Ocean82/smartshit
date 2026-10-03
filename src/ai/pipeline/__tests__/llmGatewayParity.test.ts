/**
 * Parity tests for LLMGateway stage (FEAT-001 / F7).
 *
 * Guards two regressions where the LLM path diverged from the deterministic path:
 *   (a) llmGateway ignored context.attachedPreview and analyzed the active sheet
 *       instead of the attached file.
 *   (b) buildAdaptiveContext compressed referenced (non-active) sheets with the
 *       active-sheet getComputedValue, yielding wrong cross-sheet values.
 *
 * Unlike llmGateway.test.ts, this file does NOT mock @/ai/buildContext or
 * @/ai/analysisTarget — we exercise the real resolution + compression so the
 * assertions actually fail when the fix is reverted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'
import type { CellData, SheetData, WorkbookData } from '@/types'
import type { AttachedFilePreview } from '@/ai/types'
import { buildSpreadsheetContext } from '@/ai/buildContext'

// ─── Mocks (only the server boundary + unrelated collaborators) ──────────────

vi.mock('@/ai/agentClient', () => ({
  chatWithAgentServerStream: vi.fn(),
  isAgentServerError: (v: unknown) =>
    v !== null && typeof v === 'object' && (v as { kind?: string }).kind === 'server-error',
}))

vi.mock('@/auth/useUsage', () => ({
  reportServerUsage: vi.fn(),
}))

vi.mock('@/ai/responseBuilder', () => ({
  formatInsights: vi.fn(() => ''),
  mergeToolResultContent: vi.fn((parts: string[]) => parts.filter(Boolean).join('\n\n')),
}))

vi.mock('@/ai/mode', () => ({
  isLlmOnlyMode: vi.fn(() => false),
}))

vi.mock('@/auditor', () => ({
  runAudit: vi.fn(() => ({ findings: [], score: 100 })),
  formatAuditForContext: vi.fn(() => ''),
}))

vi.mock('@/ai/contextualSuggestions', () => ({
  getContextualSuggestions: vi.fn(() => []),
}))

import { chatWithAgentServerStream } from '@/ai/agentClient'
import { createLLMGatewayStage } from '../stages/llmGateway'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function cell(value: CellData['value'], formula?: string): CellData {
  return formula ? { value, formula } : { value }
}

function makeSheet(id: string, name: string, cells: Record<string, CellData>): SheetData {
  return {
    id,
    name,
    cells,
    columnWidths: {},
    rowHeights: {},
  }
}

function makeWorkbook(name: string, sheets: SheetData[]): WorkbookData {
  return {
    id: `wb-${name}`,
    name,
    sheets,
    activeSheetId: sheets[0].id,
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeContext(overrides: Partial<PipelineContext>): PipelineContext {
  return {
    message: 'explain my data',
    workbook: overrides.workbook!,
    sheet: overrides.sheet!,
    selection: null,
    getComputedValue: () => '',
    getSheetComputedValue: () => '',
    history: [],
    onToken: vi.fn(),
    mode: 'chat',
    ...overrides,
  }
}

/** Capture the payload passed to the server for a single turn. */
async function runAndCaptureContext(context: PipelineContext) {
  let captured: Record<string, unknown> | undefined
  vi.mocked(chatWithAgentServerStream).mockImplementation(async (req) => {
    captured = req.context as unknown as Record<string, unknown>
    return { message: 'ok', actions: [], source: 'llm' }
  })

  const stage = createLLMGatewayStage()
  await stage.process(context)
  if (!captured) throw new Error('server was not called')
  return captured
}

describe('LLMGateway parity with the deterministic path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) Attachment must be analyzed instead of the active sheet.
  it('analyzes the attached file, not the active sheet', async () => {
    const ACTIVE_MARKER = 'ACTIVE_ONLY_MARKER'
    const ATTACHED_MARKER = 'ATTACHED_ONLY_MARKER'

    const activeSheet = makeSheet('active-1', 'Active', {
      A1: cell('Label'),
      A2: cell(ACTIVE_MARKER),
    })
    const activeWorkbook = makeWorkbook('active-book', [activeSheet])

    const attachedSheet = makeSheet('att-1', 'Imported', {
      A1: cell('Label'),
      A2: cell(ATTACHED_MARKER),
    })
    const attachedWorkbook = makeWorkbook('attached-book', [attachedSheet])
    const attachedPreview: AttachedFilePreview = {
      fileName: 'quarterly.xlsx',
      workbook: attachedWorkbook,
      context: buildSpreadsheetContext(attachedWorkbook, attachedSheet, null, () => ''),
    }

    const context = makeContext({
      workbook: activeWorkbook,
      sheet: activeSheet,
      attachedPreview,
    })

    const payload = await runAndCaptureContext(context)

    // Payload reflects the attached workbook, not the active one.
    expect(payload.workbookName).toBe('attached-book')
    const flatSamples = JSON.stringify(payload.sampleRows ?? [])
    expect(flatSamples).toContain(ATTACHED_MARKER)
    expect(flatSamples).not.toContain(ACTIVE_MARKER)
  })

  // (b) Referenced non-active sheet must be read through the sheet-scoped accessor.
  it('encodes a referenced sheet with its own sheet-scoped computed values', async () => {
    // Active sheet references Sheet2 by name so cross-sheet detection fires.
    const activeSheet = makeSheet('s1', 'Sheet1', {
      A1: cell('Pull'),
      B1: cell('', '=Sheet2!A1'),
    })
    // Sheet2's cells are formulas with EMPTY stored values. The compressor's
    // matrix value for a formula cell is `computed || storedValue`, so a cell
    // only survives into the encoding when the computed-value accessor returns
    // something non-empty for it. The sheet-scoped accessor is keyed by sheet
    // id; the active-only accessor is not — so if the referenced sheet were read
    // through the active accessor (the bug), these cells would resolve to '' and
    // Sheet2 would compress to an empty encoding.
    const sheet2 = makeSheet('s2', 'Sheet2', {
      A1: cell('', '=Revenue'),
      A2: cell('', '=Costs'),
    })
    const workbook = makeWorkbook('cross-book', [activeSheet, sheet2])

    const context = makeContext({
      workbook,
      sheet: activeSheet,
      // Active-only accessor has NO visibility into Sheet2 — returns empty.
      getComputedValue: () => '',
      // Sheet-scoped accessor resolves Sheet2's cells to real values.
      getSheetComputedValue: (sheetId) => (sheetId === 's2' ? '42000' : ''),
    })

    const payload = await runAndCaptureContext(context)

    const encoding = String(payload.compressedEncoding ?? '')
    expect(encoding).toContain(`--- Sheet: "Sheet2" ---`)
    // Fix in place: Sheet2's formula cells survive compression (addresses present).
    expect(encoding).toContain('"=Revenue":A1')
    expect(encoding).toContain('"=Costs":A2')
    // Reverting to the active-sheet accessor collapses Sheet2 to an empty encoding.
    expect(encoding).not.toContain('"empty": true')
  })
})
