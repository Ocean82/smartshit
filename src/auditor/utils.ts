/**
 * Spreadsheet Auditor — Utility functions.
 */

import { colToLetter, letterToCol, cellToRef, refToCell } from '@/engine/spreadsheet'
import type { CellInfo } from './types'

export { colToLetter, letterToCol, cellToRef, refToCell }

/** Generate a short random ID for findings. */
export function findingId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Check if a computed value represents a formula error. */
export function isErrorValue(value: string): boolean {
  return /^#(REF|VALUE|DIV\/0|NAME\?|NULL|N\/A|NUM)!?$/i.test(value)
}

/** Extract the error type (e.g., "#REF!") from a computed value. */
export function getErrorType(value: string): string | undefined {
  const match = value.match(/^(#(?:REF|VALUE|DIV\/0|NAME\?|NULL|N\/A|NUM)!?)$/i)
  return match ? match[1].toUpperCase() : undefined
}

/** Classify a cell's type based on its data. */
export function classifyCellType(
  rawValue: string | number | boolean | null,
  formula: string | null,
  computedValue: string,
): CellInfo['type'] {
  if (formula) return 'formula'
  if (isErrorValue(computedValue)) return 'error'
  if (rawValue === null || rawValue === undefined || rawValue === '') return 'empty'
  if (typeof rawValue === 'number') return 'number'
  if (typeof rawValue === 'boolean') return 'boolean'
  return 'string'
}

/** Extract all cell references (e.g., "A1", "BC23") from a formula string. */
export function extractCellRefs(formula: string): string[] {
  const refs: string[] = []
  const pattern = /\b([A-Z]{1,3}\d{1,5})\b/g
  let match
  while ((match = pattern.exec(formula)) !== null) {
    refs.push(match[1])
  }
  return refs
}

/** Extract range references (e.g., "A1:A10") from a formula string. */
export function extractRangeRefs(formula: string): Array<{ range: string; start: string; end: string }> {
  const ranges: Array<{ range: string; start: string; end: string }> = []
  const pattern = /\b([A-Z]{1,3}\d{1,5}):([A-Z]{1,3}\d{1,5})\b/g
  let match
  while ((match = pattern.exec(formula)) !== null) {
    ranges.push({ range: match[0], start: match[1], end: match[2] })
  }
  return ranges
}

/**
 * Normalize a formula for pattern comparison.
 * Replaces cell refs with relative offsets from the cell's position,
 * EXCEPT for references that only vary in the same axis as the cell's
 * direction (column offset stays constant = same-column ref = relative;
 * row offset stays constant across group = likely a constant/absolute ref).
 *
 * Heuristic: if a reference's column matches the formula's own column offset
 * (within the same row or a fixed row), it gets relative treatment.
 * References to the SAME absolute cell across the group (like $G$1 or a
 * header row) are detected by the caller via a two-pass approach.
 *
 * Simple approach: Normalize same-row refs as relative, but refs pointing to
 * row 0 (headers) or a row far away from the formula are marked as absolute.
 */
export function normalizeFormula(formula: string, row: number, col: number): string {
  return formula.replace(/(\$?)([A-Z]{1,3})(\$?)(\d{1,5})\b/g, (match, colAbs: string, colStr: string, rowAbs: string, rowStr: string) => {
    const refCol = letterToCol(colStr)
    const refRow = parseInt(rowStr, 10) - 1

    // If either axis is explicitly absolute ($A$1 or $A1 or A$1), preserve as-is
    if (colAbs === '$' || rowAbs === '$') {
      return `ABS[${colStr}${rowStr}]`
    }

    // Heuristic: if the reference points to row 0 (header row) or the same fixed
    // cell regardless of formula position (row offset > 3 rows away), treat as constant
    if (refRow === 0 && row > 0) {
      return `ABS[${colStr}${rowStr}]`
    }

    return `R[${refRow - row}]C[${refCol - col}]`
  })
}

/** Check if a cell looks like a summary/total row (heuristic). */
export function isSummaryCell(cellInfo: CellInfo, allCellsInCol: CellInfo[]): boolean {
  if (!cellInfo.formula) return false

  // If it's the last formula in its column, it's likely a summary
  const formulaCellsInCol = allCellsInCol.filter((c) => c.formula && c.row <= cellInfo.row)
  if (cellInfo.row === Math.max(...formulaCellsInCol.map((c) => c.row))) return true

  // If the formula references a range within the same column (SUM, AVERAGE, etc.)
  const aggregatePattern = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|SUBTOTAL)\b/i
  return aggregatePattern.test(cellInfo.formula)
}
