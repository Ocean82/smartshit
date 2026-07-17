/**
 * format_cells — canonical formatting tool implementation.
 *
 * Handles the full contract advertised to the LLM and the fast-path parser:
 * - `range`: A1-style range ("B2:D10"), column ("B" or "B:B"), or single cell
 * - `condition`: value-based targeting ("highlight cells containing 4")
 * - style params: bold, italic, fontSize, bgColor, fontColor
 *
 * Target resolution when `range` is omitted:
 * - with a condition: scan the multi-cell selection if one exists, otherwise all populated cells
 * - without a condition: use the selection if any, otherwise all populated cells
 */

import type { CellFormat, SheetData } from '@/types'
import type { FormatCellsParams, FormatCondition } from '@shared/toolTypes'
import { cellToRef, refToCell, letterToCol } from '@/engine/spreadsheet'
import { parseNumericDisplay } from '@/lib/conditionalFormat'

export interface FormatCellsContext {
  getActiveSheet: () => SheetData
  getComputedValue: (row: number, col: number) => string
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
  pushHistory: (desc: string) => void
  /** Currently selected cell ids, if any. */
  getSelection?: () => string[]
}

export interface FormatCellsResult {
  success: boolean
  message: string
  modified: number
}

/** Cell ids with a value or formula. */
function populatedCellIds(sheet: SheetData): string[] {
  const ids: string[] = []
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if ((cell.value != null && cell.value !== '') || cell.formula) ids.push(cellId)
  }
  return ids
}

/**
 * Expand an A1-style range spec into cell ids. Supports multi-letter columns.
 * - "B2:D10" → every cell in the rectangle
 * - "B" / "B:B" → populated cells in that column
 * - "B3" → single cell
 * Returns null when the spec cannot be parsed.
 */
export function expandRange(range: string, sheet: SheetData): string[] | null {
  const spec = range.trim().toUpperCase()

  const rect = spec.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
  if (rect) {
    const startCol = letterToCol(rect[1])
    const startRow = parseInt(rect[2]) - 1
    const endCol = letterToCol(rect[3])
    const endRow = parseInt(rect[4]) - 1
    const cells: string[] = []
    for (let r = Math.min(startRow, endRow); r <= Math.max(startRow, endRow); r++) {
      for (let c = Math.min(startCol, endCol); c <= Math.max(startCol, endCol); c++) {
        cells.push(refToCell(r, c))
      }
    }
    return cells
  }

  const colOnly = spec.match(/^([A-Z]+)(?::\1)?$/)
  if (colOnly) {
    const col = letterToCol(colOnly[1])
    return populatedCellIds(sheet).filter((id) => cellToRef(id).col === col)
  }

  if (/^[A-Z]+\d+$/.test(spec)) return [spec]

  return null
}

/**
 * Normalize loose condition shapes into FormatCondition.
 * Accepts the canonical `{operator, value}`, shorthand `{contains: "4"}` /
 * `{gt: 500}` objects the LLM sometimes emits, and bare strings like "negative".
 */
export function normalizeCondition(raw: unknown): FormatCondition | null {
  if (raw == null) return null

  if (typeof raw === 'string') {
    const s = raw.toLowerCase()
    if (s === 'negative' || s === 'positive') return { operator: s }
    return null
  }

  if (typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const validOps = ['eq', 'lt', 'gt', 'lte', 'gte', 'contains', 'negative', 'positive'] as const
  const op = typeof obj.operator === 'string' ? obj.operator.toLowerCase() : null
  if (op && (validOps as readonly string[]).includes(op)) {
    return {
      operator: op as FormatCondition['operator'],
      value: obj.value as string | number | undefined,
    }
  }

  // Shorthand shapes: {contains: "4"}, {gt: 500}, {equals: 0}, ...
  const shorthand: Record<string, FormatCondition['operator']> = {
    contains: 'contains',
    eq: 'eq',
    equals: 'eq',
    gt: 'gt',
    greaterthan: 'gt',
    lt: 'lt',
    lessthan: 'lt',
    lte: 'lte',
    gte: 'gte',
  }
  for (const [key, operator] of Object.entries(shorthand)) {
    const found = Object.keys(obj).find((k) => k.toLowerCase() === key)
    if (found !== undefined && obj[found] != null) {
      return { operator, value: obj[found] as string | number }
    }
  }

  return null
}

/** Does a cell's computed display value satisfy the condition? */
export function cellMatchesCondition(computed: string, condition: FormatCondition): boolean {
  const display = String(computed ?? '')

  if (condition.operator === 'contains') {
    if (condition.value == null) return false
    return display.toLowerCase().includes(String(condition.value).toLowerCase())
  }

  const num = parseNumericDisplay(display)

  if (condition.operator === 'negative') return Number.isFinite(num) && num < 0
  if (condition.operator === 'positive') return Number.isFinite(num) && num > 0

  const target = typeof condition.value === 'number'
    ? condition.value
    : parseNumericDisplay(String(condition.value ?? ''))

  if (condition.operator === 'eq') {
    if (Number.isFinite(num) && Number.isFinite(target)) return num === target
    // Fall back to case-insensitive text equality for non-numeric values
    return display.trim().toLowerCase() === String(condition.value ?? '').trim().toLowerCase()
  }

  if (!Number.isFinite(num) || !Number.isFinite(target)) return false
  switch (condition.operator) {
    case 'gt': return num > target
    case 'lt': return num < target
    case 'gte': return num >= target
    case 'lte': return num <= target
    default: return false
  }
}

/** Find cell ids in the candidate set whose computed value matches the condition. */
export function findMatchingCellIds(
  sheet: SheetData,
  candidates: string[],
  condition: FormatCondition,
  getComputedValue: (row: number, col: number) => string,
): string[] {
  return candidates.filter((cellId) => {
    const ref = cellToRef(cellId)
    return cellMatchesCondition(getComputedValue(ref.row, ref.col), condition)
  })
}

/** Build the CellFormat patch from style params. Returns null when no style was requested. */
export function buildFormatPatch(params: FormatCellsParams): Partial<CellFormat> | null {
  const patch: Partial<CellFormat> = {}
  if (params.bold != null) patch.bold = params.bold
  if (params.italic != null) patch.italic = params.italic
  if (typeof params.fontSize === 'number') patch.fontSize = params.fontSize
  if (typeof params.bgColor === 'string' && params.bgColor) patch.bgColor = params.bgColor
  if (typeof params.fontColor === 'string' && params.fontColor) patch.fontColor = params.fontColor
  return Object.keys(patch).length > 0 ? patch : null
}

/** Apply format_cells against the sheet. Accepts loose params (LLM or parser output). */
export function applyFormatCells(
  rawParams: Record<string, unknown>,
  ctx: FormatCellsContext,
): FormatCellsResult {
  const params = rawParams as FormatCellsParams & { condition?: unknown }
  const sheet = ctx.getActiveSheet()

  const patch = buildFormatPatch(params)
  if (!patch) {
    return { success: false, message: 'No formatting specified — tell me what style to apply (e.g. bold, a color).', modified: 0 }
  }

  const condition = normalizeCondition(params.condition)

  // Resolve candidate cells
  let candidates: string[] | null = null
  if (typeof params.range === 'string' && params.range.trim()) {
    candidates = expandRange(params.range, sheet)
    if (!candidates) {
      return { success: false, message: `Could not understand range "${params.range}".`, modified: 0 }
    }
  } else {
    const selection = ctx.getSelection?.() ?? []
    if (condition) {
      // A single-cell selection is just the cursor — scan the whole sheet instead
      candidates = selection.length > 1 ? selection : populatedCellIds(sheet)
    } else {
      candidates = selection.length > 0 ? selection : populatedCellIds(sheet)
    }
  }

  const targets = condition
    ? findMatchingCellIds(sheet, candidates, condition, ctx.getComputedValue)
    : candidates

  if (targets.length === 0) {
    const why = condition
      ? `No cells matched the condition (${condition.operator}${condition.value != null ? ` ${condition.value}` : ''}).`
      : 'No cells to format — the sheet is empty and nothing is selected.'
    return { success: false, message: why, modified: 0 }
  }

  ctx.pushHistory('Format cells')
  for (const cellId of targets) {
    ctx.setCellFormat(cellId, patch)
  }

  const styleDesc = Object.entries(patch).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(', ')
  return {
    success: true,
    message: `Formatted ${targets.length} cell${targets.length === 1 ? '' : 's'} (${styleDesc})`,
    modified: targets.length,
  }
}
