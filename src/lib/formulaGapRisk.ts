/**
 * Range-gap risk detection for AI-written aggregate formulas.
 *
 * Flags the auditor's classic "SUM skips a cell" bug before it is written: an
 * aggregate range that stops one cell short of an adjacent numeric value.
 */
import type { SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { extractRangeRefs } from '@/auditor/utils'

const AGGREGATE_PATTERN = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|SUBTOTAL)\b/i

type ComputedValueGetter = (row: number, col: number) => string

function parseNumericCell(
  sheet: SheetData,
  cellId: string,
  row: number,
  col: number,
  getComputedValue: ComputedValueGetter,
): number | null {
  const cell = sheet.cells[cellId]
  if (!cell && !getComputedValue(row, col)) return null
  const raw = cell?.value
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const computed = getComputedValue(row, col).replace(/[$,]/g, '')
  const num = parseFloat(computed)
  return Number.isFinite(num) && computed.trim() !== '' ? num : null
}

/**
 * Returns a user-facing warning when an aggregate range in `formula` excludes an
 * immediately adjacent numeric cell, or null when no gap is found. The cell the
 * formula will be written to is never treated as a skipped neighbor.
 */
export function detectFormulaRangeGapRisk(
  formula: string,
  sheet: SheetData,
  getComputedValue: ComputedValueGetter,
  formulaCellId?: string,
): string | null {
  if (!AGGREGATE_PATTERN.test(formula)) return null
  const ranges = extractRangeRefs(formula.replace(/^=/, ''))

  const check = (range: string, row: number, col: number): string | null => {
    if (row < 0 || col < 0) return null
    const neighborId = refToCell(row, col)
    if (neighborId === formulaCellId) return null
    const num = parseNumericCell(sheet, neighborId, row, col, getComputedValue)
    return num == null ? null : `Range ${range} leaves out the neighboring value in ${neighborId} (${num}).`
  }

  for (const { range, start, end } of ranges) {
    const startRef = cellToRef(start)
    const endRef = cellToRef(end)
    if (startRef.col === endRef.col) {
      const minRow = Math.min(startRef.row, endRef.row)
      const maxRow = Math.max(startRef.row, endRef.row)
      const risk = check(range, minRow - 1, startRef.col) ?? check(range, maxRow + 1, startRef.col)
      if (risk) return risk
    }
    if (startRef.row === endRef.row) {
      const minCol = Math.min(startRef.col, endRef.col)
      const maxCol = Math.max(startRef.col, endRef.col)
      const risk = check(range, startRef.row, minCol - 1) ?? check(range, startRef.row, maxCol + 1)
      if (risk) return risk
    }
  }
  return null
}
