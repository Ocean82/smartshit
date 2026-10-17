import type { CellChange, SheetData } from '@/types'
import type { ActionStep } from '@/ai/nlp/types'
import { cellToRef, refToCell, letterToCol } from '@/engine/spreadsheet'
import { findLastDataRow } from '@/lib/sheetSort'
import { resolveDeleteRow } from '@/lib/deleteRowPreview'
import { getColumnDataRows } from '@/lib/sheetRows'
import { buildRecipePlan, isStyleRecipe, planToPreviewChanges } from '@/lib/styleRecipes'
import { detectFormulaRangeGapRisk } from '@/lib/formulaGapRisk'
import { expandRange } from '@/lib/formatCellsTool'
import { resolveColumnIndex } from '@/agent/toolHandlers/types'

/**
 * Build CellChange[] previews for proposed mutations (Phase 1 grid overlay).
 * Pattern inspired by temp AgentTools.stageWrite* — adapted to current types.
 */

export function previewSetRange(
  sheet: SheetData,
  startCell: string,
  values: unknown[][],
): CellChange[] {
  const start = cellToRef(startCell.toUpperCase())
  if (!start || !Array.isArray(values)) return []
  const changes: CellChange[] = []

  for (let r = 0; r < values.length; r++) {
    const row = values[r]
    if (!Array.isArray(row)) continue
    for (let c = 0; c < row.length; c++) {
      const cellId = refToCell(start.row + r, start.col + c)
      const current = sheet.cells[cellId]
      const raw = row[c]
      const isFormula = typeof raw === 'string' && raw.startsWith('=')
      changes.push({
        cell: cellId,
        oldValue: current?.value ?? null,
        newValue: isFormula ? null : (raw as string | number | boolean | null),
        oldFormula: current?.formula,
        newFormula: isFormula ? String(raw) : undefined,
      })
    }
  }
  return changes
}

export function previewModifyColumn(
  sheet: SheetData,
  column: string,
  operation: string,
  factor: number,
  getComputedValue: (row: number, col: number) => string,
): CellChange[] {
  if (!Number.isFinite(factor)) return []
  const colIdx = resolveColumnIndex(column, sheet, getComputedValue)
  if (colIdx == null || colIdx < 0) return []

  const changes: CellChange[] = []
  const lastRow = findLastDataRow(sheet)

  for (let row = 0; row <= lastRow; row++) {
    const cellId = refToCell(row, colIdx)
    const cell = sheet.cells[cellId]
    if (!cell) continue
    const computed = getComputedValue(row, colIdx)
    const num = parseFloat(computed.replace(/[$,]/g, ''))
    if (isNaN(num)) continue

    let newVal: number
    switch (operation) {
      case 'multiply': newVal = num * factor; break
      case 'add': newVal = num + factor; break
      case 'subtract': newVal = num - factor; break
      case 'divide': newVal = factor !== 0 ? num / factor : num; break
      default: newVal = num
    }
    const rounded = Math.round(newVal * 100) / 100
    changes.push({
      cell: cellId,
      oldValue: cell.value ?? null,
      newValue: rounded,
      oldFormula: cell.formula,
    })
  }
  return changes
}

/** Preview a single apply_formula write (cell or column-target). */
export function previewApplyFormula(
  sheet: SheetData,
  params: Record<string, unknown>,
  getComputedValue: (row: number, col: number) => string,
): CellChange[] {
  const target = String((params.cell ?? params.column ?? '')).trim().toUpperCase()
  if (!target) return []

  let formula = String(params.formula ?? '=SUM')
  if (!formula.startsWith('=')) formula = `=${formula}`

  let cellId: string
  let fullFormula = formula

  if (/^[A-Z]{1,3}$/.test(target)) {
    const colIdx = letterToCol(target)
    const bounds = getColumnDataRows(sheet, colIdx, getComputedValue)
    if (!bounds) return []
    cellId = refToCell(bounds.lastRow + 1, colIdx)
    fullFormula = formula.includes('(')
      ? formula
      : `${formula}(${target}${bounds.firstRow + 1}:${target}${bounds.lastRow + 1})`
  } else if (/^[A-Z]{1,3}\d+$/.test(target)) {
    cellId = target
  } else {
    return []
  }

  const current = sheet.cells[cellId]
  return [{
    cell: cellId,
    oldValue: current?.value ?? null,
    newValue: null,
    oldFormula: current?.formula,
    newFormula: fullFormula,
  }]
}

/**
 * Preview a `clear_sheet`: every cell that actually holds content would be
 * emptied. Without this, `clear_sheet` could be proposed but never applied —
 * Apply demanded a preview that no builder produced.
 */
export function previewClearSheet(sheet: SheetData): CellChange[] {
  const MAX_PREVIEW_CELLS = 200
  const ids = Object.keys(sheet.cells).sort()
  const changes: CellChange[] = []
  for (const cellId of ids) {
    const cell = sheet.cells[cellId]
    if (!cell) continue
    const hasContent =
      (cell.value != null && cell.value !== '') ||
      Boolean(cell.formula) ||
      Boolean(cell.format) ||
      Boolean(cell.validation)
    if (!hasContent) continue
    changes.push({
      cell: cellId,
      oldValue: cell.value ?? null,
      newValue: null,
      oldFormula: cell.formula,
    })
    if (changes.length >= MAX_PREVIEW_CELLS) break
  }
  return changes
}

/** Layout tools that change sizing, not cell contents. */
const MACRO_LAYOUT_TOOLS = new Set(['auto_fit', 'set_column_width', 'set_row_height'])

/** Cap on per-cell preview entries — mirrors previewClearSheet's convention so
 *  a huge/sparse/column-spec range can't allocate a CellChange per cell. */
const MAX_PREVIEW_CELLS = 200

/** A value/formula-preserving CellChange for `cellId`: newValue === oldValue and
 *  newFormula === oldFormula, so the overlay renders the UNCHANGED content and
 *  the diff can never show a data write. */
function preserveChange(sheet: SheetData, cellId: string, description: string): CellChange {
  const current = sheet.cells[cellId]
  const value = current?.value ?? null
  return {
    cell: cellId,
    oldValue: value,
    newValue: value, // value preserved — display-only, never a data write
    oldFormula: current?.formula,
    newFormula: current?.formula, // formula preserved
    description,
  }
}

/** First populated cell id (value or formula), in A1 sort order, or null. */
function firstPopulatedCellId(sheet: SheetData): string | null {
  const ids = Object.keys(sheet.cells)
    .filter((id) => {
      const c = sheet.cells[id]
      return c && ((c.value != null && c.value !== '') || c.formula)
    })
    .sort()
  return ids[0] ?? null
}

/** Pick an anchor cell for a layout step so a layout-only plan still previews.
 *  Uses the step's range/column when present, else the first populated cell. */
function layoutAnchorCell(sheet: SheetData, step: ActionStep): string | null {
  const range = step.params?.range
  if (typeof range === 'string' && range.trim()) {
    const ids = expandRange(range, sheet)
    if (ids && ids.length) return ids[0]
  }
  const column = step.params?.column
  if (typeof column === 'string' && column.trim()) {
    const ids = expandRange(column, sheet)
    if (ids && ids.length) return ids[0]
  }
  return firstPopulatedCellId(sheet)
}

/**
 * Preview an `execute_macro`: flatten every executable step into
 * value/formula-preserving CellChange[]. The makeover macro
 * (src/lib/sheetMakeover.ts) emits ONLY formatting/layout steps, so every
 * emitted change leaves BOTH value and formula untouched (newValue === oldValue,
 * newFormula === oldFormula) — the diff can never show a data write.
 *
 * - format_cells steps emit one preserving change per cell in the range.
 * - layout steps (auto_fit / set_column_width / set_row_height) emit one
 *   preserving anchor change so a layout-only plan still produces a non-empty
 *   preview (no executable step is applyable without being previewed).
 * - cells covered by overlapping ranges are emitted once (dedupe), and the
 *   total is bounded by MAX_PREVIEW_CELLS; when the cap is hit, a single
 *   value-preserving summary change notes the remaining count.
 */
export function previewExecuteMacro(sheet: SheetData, steps: ActionStep[]): CellChange[] {
  const changes: CellChange[] = []
  const seen = new Set<string>()
  let capped = false

  const emit = (cellId: string, description: string): boolean => {
    if (seen.has(cellId)) return true // dedupe across overlapping ranges
    if (changes.length >= MAX_PREVIEW_CELLS) {
      capped = true
      return false
    }
    seen.add(cellId)
    changes.push(preserveChange(sheet, cellId, description))
    return true
  }

  for (const step of steps) {
    if (step.tool === 'format_cells') {
      const range = step.params?.range
      if (typeof range !== 'string' || !range.trim()) continue
      const cellIds = expandRange(range, sheet)
      if (!cellIds) continue
      for (const cellId of cellIds) {
        if (!emit(cellId, step.description)) break
      }
    } else if (MACRO_LAYOUT_TOOLS.has(step.tool)) {
      // Layout changes no cell contents; still emit a representative preserving
      // change so a layout-only plan is previewable and cannot apply unseen.
      const anchor = layoutAnchorCell(sheet, step)
      if (anchor) emit(anchor, step.description)
    }
    if (capped) break
  }

  if (capped) {
    // One value-preserving summary row so the UI signals the preview was
    // bounded rather than silently dropping cells. No cell data is written.
    const anchor = firstPopulatedCellId(sheet)
    if (anchor) {
      const current = sheet.cells[anchor]
      const value = current?.value ?? null
      changes.push({
        cell: anchor,
        oldValue: value,
        newValue: value,
        oldFormula: current?.formula,
        newFormula: current?.formula,
        description: `Preview limited to ${MAX_PREVIEW_CELLS} cells; more cells will be formatted`,
      })
    }
  }

  return changes
}

/** Attach preview.changes onto an action when the tool supports it. */
export function buildActionPreview(
  tool: string,
  params: Record<string, unknown>,
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): { changes: CellChange[]; warnings?: string[] } | undefined {
  if (tool === 'set_range' && Array.isArray(params.values) && typeof params.startCell === 'string') {
    const changes = previewSetRange(sheet, params.startCell, params.values as unknown[][])
    return changes.length ? { changes } : undefined
  }
  if (tool === 'clear_sheet') {
    // Always return an object (even for an empty sheet) so the high-impact
    // preview gate is satisfied by a *locally built* preview rather than by
    // whatever the model happened to send.
    return { changes: previewClearSheet(sheet) }
  }
  if (tool === 'modify_column' && typeof params.column === 'string') {
    const changes = previewModifyColumn(
      sheet,
      params.column,
      String(params.operation ?? 'multiply'),
      Number(params.factor),
      getComputedValue,
    )
    return changes.length ? { changes } : undefined
  }
  if (tool === 'apply_formula') {
    const changes = previewApplyFormula(sheet, params, getComputedValue)
    if (!changes.length) return undefined
    const [change] = changes
    const gapRisk = change.newFormula
      ? detectFormulaRangeGapRisk(change.newFormula, sheet, getComputedValue, change.cell)
      : null
    return gapRisk ? { changes, warnings: [gapRisk] } : { changes }
  }
  if (tool === 'style_recipe' && isStyleRecipe(params.recipe)) {
    const theme = typeof params.theme === 'string' ? params.theme : 'blue'
    const plan = buildRecipePlan(params.recipe, sheet, getComputedValue, theme)
    if (!plan) return undefined
    const changes = planToPreviewChanges(plan, sheet)
    return changes.length ? { changes } : undefined
  }
  if (tool === 'delete_row') {
    const resolved = resolveDeleteRow(sheet, params, getComputedValue)
    return resolved?.changes.length ? { changes: resolved.changes } : undefined
  }
  if (tool === 'execute_macro' && Array.isArray(params.steps)) {
    const changes = previewExecuteMacro(sheet, params.steps as ActionStep[])
    return changes.length ? { changes } : undefined
  }
  // `clean_sheet_data` is the one tool whose deterministic skill attaches its
  // own preview rows in params. Anything else carrying `previewChanges` is
  // treated as untrusted and ignored — model-authored previews must never
  // satisfy the review gate (see shared/actionParams.ts).
  if (tool === 'clean_sheet_data' && Array.isArray(params.previewChanges) && params.previewChanges.length > 0) {
    return { changes: params.previewChanges as CellChange[] }
  }
  return undefined
}
