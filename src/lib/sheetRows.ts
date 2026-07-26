import type { SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'

export interface SheetBounds {
  maxRow: number
  maxCol: number
}

export function getSheetBounds(sheet: SheetData): SheetBounds {
  let maxRow = -1
  let maxCol = -1
  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }
  return { maxRow, maxCol }
}

/** Labels that unambiguously identify an aggregate/summary row. */
const EXACT_SUMMARY_LABEL = /^(?:(?:grand|annual)\s+)?(?:sub)?totals?\s*:?$/i
const PREFIXED_SUMMARY_LABEL = /^(?:(?:grand|annual)\s+)?(?:sub)?totals?\s+\S+/i
const KNOWN_SUMMARY_LABEL = /^(?:(?:grand|annual)\s+)?(?:sub)?totals?\s+(?:amount|income|expenses?|revenue|cogs|costs?|cash\s+receipts|opex|paid|interest|investment|payments?|outstanding|inventory\s+value|budget|contributions?|assets?|liabilities|payroll|employees?|tasks?|credits?|potential|applied|sets?|lost|\d+-year\s+cost)\s*:?$/i

function displayValue(
  sheet: SheetData,
  row: number,
  col: number,
  getComputedValue: (row: number, col: number) => string,
): string {
  const cell = sheet.cells[refToCell(row, col)]
  const computed = getComputedValue(row, col)
  if (cell?.formula && computed !== '') return computed
  if (cell?.value != null) return String(cell.value)
  return computed
}

/**
 * Identify rows that summarize other rows (Total, Subtotal, Total Expenses…).
 *
 * Common imported summary labels are recognized directly; other `Total …`
 * labels require a formula on the row. This avoids treating an ordinary
 * category or merchant such as "Total Wine" as a summary.
 */
export function findSummaryRowIndexes(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): Set<number> {
  const { maxRow, maxCol } = getSheetBounds(sheet)
  const rows = new Set<number>()
  if (maxRow < 0 || maxCol < 0) return rows

  for (let row = 0; row <= maxRow; row++) {
    let hasExactLabel = false
    let hasKnownSummaryLabel = false
    let hasPrefixedLabel = false
    let hasFormula = false

    for (let col = 0; col <= maxCol; col++) {
      const cell = sheet.cells[refToCell(row, col)]
      if (cell?.formula) hasFormula = true
      const value = displayValue(sheet, row, col, getComputedValue).trim()
      if (!value) continue
      if (EXACT_SUMMARY_LABEL.test(value)) hasExactLabel = true
      else if (KNOWN_SUMMARY_LABEL.test(value)) hasKnownSummaryLabel = true
      else if (PREFIXED_SUMMARY_LABEL.test(value)) hasPrefixedLabel = true
    }

    if (hasExactLabel || hasKnownSummaryLabel || (hasPrefixedLabel && hasFormula)) {
      rows.add(row)
    }
  }
  return rows
}
