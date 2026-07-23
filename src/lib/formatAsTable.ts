/**
 * Format as Table — auto-detect data ranges, apply banded styling, attach headers.
 *
 * Inspired by Univer's sheets-table package (Apache-2.0).
 * Provides one-shot "Format as Table" functionality for the AI chat or toolbar.
 */

import type { CellData, CellFormat, ConditionalRule, FilterConfig, SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

// ─── Table Styles ───────────────────────────────────────────────────────────

export interface TableStyleTheme {
  name: string
  headerBg: string
  headerFontColor: string
  headerBold: boolean
  bandedRowEven: string
  bandedRowOdd: string
  borderColor: string
  accentColor: string
}

export const TABLE_THEMES: Record<string, TableStyleTheme> = {
  blue: {
    name: 'Blue',
    headerBg: '#1e40af',
    headerFontColor: '#ffffff',
    headerBold: true,
    bandedRowEven: '#eff6ff',
    bandedRowOdd: '#ffffff',
    borderColor: '#bfdbfe',
    accentColor: '#3b82f6',
  },
  green: {
    name: 'Green',
    headerBg: '#166534',
    headerFontColor: '#ffffff',
    headerBold: true,
    bandedRowEven: '#f0fdf4',
    bandedRowOdd: '#ffffff',
    borderColor: '#bbf7d0',
    accentColor: '#22c55e',
  },
  purple: {
    name: 'Purple',
    headerBg: '#581c87',
    headerFontColor: '#ffffff',
    headerBold: true,
    bandedRowEven: '#faf5ff',
    bandedRowOdd: '#ffffff',
    borderColor: '#e9d5ff',
    accentColor: '#a855f7',
  },
  orange: {
    name: 'Orange',
    headerBg: '#9a3412',
    headerFontColor: '#ffffff',
    headerBold: true,
    bandedRowEven: '#fff7ed',
    bandedRowOdd: '#ffffff',
    borderColor: '#fed7aa',
    accentColor: '#f97316',
  },
  slate: {
    name: 'Slate',
    headerBg: '#1e293b',
    headerFontColor: '#ffffff',
    headerBold: true,
    bandedRowEven: '#f8fafc',
    bandedRowOdd: '#ffffff',
    borderColor: '#e2e8f0',
    accentColor: '#64748b',
  },
  minimal: {
    name: 'Minimal',
    headerBg: '#f8fafc',
    headerFontColor: '#1e293b',
    headerBold: true,
    bandedRowEven: '#ffffff',
    bandedRowOdd: '#ffffff',
    borderColor: '#e2e8f0',
    accentColor: '#94a3b8',
  },
}

// ─── Table Detection ────────────────────────────────────────────────────────

export interface DetectedTableRange {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
  headerRow: number
  headers: string[]
}

/**
 * Auto-detect the contiguous data range in a sheet (header row + data rows).
 * Tries to find the bounding rectangle of non-empty cells.
 */
export function detectTableRange(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): DetectedTableRange | null {
  const cellIds = Object.keys(sheet.cells)
  if (cellIds.length === 0) return null

  let minRow = Infinity
  let maxRow = -Infinity
  let minCol = Infinity
  let maxCol = -Infinity

  for (const cellId of cellIds) {
    const ref = cellToRef(cellId)
    const cell = sheet.cells[cellId]
    if (cell.value == null && !cell.formula) continue
    minRow = Math.min(minRow, ref.row)
    maxRow = Math.max(maxRow, ref.row)
    minCol = Math.min(minCol, ref.col)
    maxCol = Math.max(maxCol, ref.col)
  }

  if (minRow === Infinity) return null

  const headerRow = findHeaderRow(sheet)

  // Extract header labels
  const headers: string[] = []
  for (let c = minCol; c <= maxCol; c++) {
    const val = getComputedValue(headerRow, c)
    headers.push(val || `Column ${c + 1}`)
  }

  return {
    startRow: headerRow,
    endRow: maxRow,
    startCol: minCol,
    endCol: maxCol,
    headerRow,
    headers,
  }
}

// ─── Format As Table ────────────────────────────────────────────────────────

export interface FormatAsTableResult {
  /** Cell format updates to apply. */
  formatUpdates: Record<string, Partial<CellFormat>>
  /** Filter configs to attach to the sheet. */
  filters: FilterConfig[]
  /** Range info for reference. */
  range: DetectedTableRange
}

/**
 * Generate format updates to style a range as a table with banded rows,
 * header styling, and column filters.
 */
export function formatAsTable(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
  themeName: string = 'blue',
  range?: DetectedTableRange,
): FormatAsTableResult | null {
  const tableRange = range ?? detectTableRange(sheet, getComputedValue)
  if (!tableRange) return null

  const theme = TABLE_THEMES[themeName] ?? TABLE_THEMES.blue
  const formatUpdates: Record<string, Partial<CellFormat>> = {}

  const { startRow, endRow, startCol, endCol, headerRow } = tableRange

  // Style header row
  for (let c = startCol; c <= endCol; c++) {
    const cellId = refToCell(headerRow, c)
    formatUpdates[cellId] = {
      bold: theme.headerBold,
      bgColor: theme.headerBg,
      fontColor: theme.headerFontColor,
      borders: {
        bottom: `2px solid ${theme.accentColor}`,
      },
    }
  }

  // Style data rows with banding
  let bandIndex = 0
  for (let r = headerRow + 1; r <= endRow; r++) {
    const bg = bandIndex % 2 === 0 ? theme.bandedRowEven : theme.bandedRowOdd
    for (let c = startCol; c <= endCol; c++) {
      const cellId = refToCell(r, c)
      formatUpdates[cellId] = {
        bgColor: bg,
        borders: {
          bottom: `1px solid ${theme.borderColor}`,
        },
      }
    }
    bandIndex++
  }

  // Generate filter configs for each column
  const filters: FilterConfig[] = []
  for (let c = startCol; c <= endCol; c++) {
    filters.push({ column: c })
  }

  return { formatUpdates, filters, range: tableRange }
}

/**
 * Generate "total row" formulas for a table.
 * Returns cell updates with SUM formulas for numeric columns.
 */
export function generateTableTotals(
  sheet: SheetData,
  range: DetectedTableRange,
  getComputedValue: (row: number, col: number) => string,
): Record<string, Partial<CellData>> | null {
  const { startCol, endCol, headerRow, endRow } = range
  const totalsRow = endRow + 1
  const updates: Record<string, Partial<CellData>> = {}

  // Label in first column
  updates[refToCell(totalsRow, startCol)] = { value: 'Total' }

  // SUM for numeric columns
  for (let c = startCol + 1; c <= endCol; c++) {
    // Check if column is mostly numeric
    let numericCount = 0
    let totalCount = 0
    for (let r = headerRow + 1; r <= endRow; r++) {
      const val = getComputedValue(r, c)
      if (val.trim() !== '') {
        totalCount++
        const num = Number(val.replace(/[$€£¥,\s]/g, ''))
        if (Number.isFinite(num)) numericCount++
      }
    }

    if (totalCount > 0 && numericCount / totalCount >= 0.5) {
      // Generate a column letter for the SUM formula
      const colLetter = columnToLetter(c)
      const formula = `=SUM(${colLetter}${headerRow + 2}:${colLetter}${endRow + 1})`
      updates[refToCell(totalsRow, c)] = { value: null, formula }
    }
  }

  return Object.keys(updates).length > 1 ? updates : null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function columnToLetter(col: number): string {
  let result = ''
  let c = col
  while (c >= 0) {
    result = String.fromCharCode(65 + (c % 26)) + result
    c = Math.floor(c / 26) - 1
  }
  return result
}
