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

// ─── Unified Data Row Bounds ──────────────────────────────────────────────────

export interface ColumnDataBounds {
  /** 0-indexed first data row (non-header, non-summary, populated in this column). */
  firstRow: number
  /** 0-indexed last data row (non-summary, populated in this column). */
  lastRow: number
  /** All summary row indexes within the sheet (for iteration-time skipping). */
  excludedRows: Set<number>
}

/**
 * Compute the data row bounds for a given column, excluding header and summary rows.
 *
 * This is the single source of truth for "which rows are data" in a column.
 * Used by goal executor (total summary, chart aggregation) and apply_formula.
 *
 * Returns null when the column has no usable data rows.
 */
export function getColumnDataRows(
  sheet: SheetData,
  colIdx: number,
  getComputedValue: (row: number, col: number) => string,
): ColumnDataBounds | null {
  const { maxRow } = getSheetBounds(sheet)
  if (maxRow < 0) return null

  const summaryRows = findSummaryRowIndexes(sheet, getComputedValue)

  // Detect header row: row 0 if it contains non-numeric text in this column
  const headerRow = isHeaderRow(sheet, colIdx) ? 0 : -1

  let firstRow = -1
  let lastRow = -1

  for (let r = 0; r <= maxRow; r++) {
    if (r === headerRow) continue
    if (summaryRows.has(r)) continue

    const cellId = refToCell(r, colIdx)
    const cell = sheet.cells[cellId]
    const hasContent = (cell?.value != null && cell.value !== '') || !!cell?.formula
    if (!hasContent) continue

    if (firstRow === -1) firstRow = r
    lastRow = r
  }

  if (firstRow === -1) return null

  return { firstRow, lastRow, excludedRows: summaryRows }
}

/** Check if row 0 looks like a header for the given column (non-numeric text). */
function isHeaderRow(sheet: SheetData, colIdx: number): boolean {
  const cellId = refToCell(0, colIdx)
  const cell = sheet.cells[cellId]
  if (!cell || cell.value == null) return false
  if (typeof cell.value === 'number' || typeof cell.value === 'boolean') return false
  const text = String(cell.value).trim()
  if (!text) return false
  // If it parses as a number, it's data, not a header
  return isNaN(parseFloat(text.replace(/[$,%]/g, '')))
}
