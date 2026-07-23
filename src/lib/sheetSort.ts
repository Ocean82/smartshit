/**
 * Sheet sorting engine — supports single and multi-column sorting.
 *
 * Enhanced with multi-column sort inspired by Univer's sheets-sort service (Apache-2.0).
 * Adds: multi-column tiered sorting, merge-cell awareness, stable sort guarantee.
 */

import { cellToRef, refToCell } from '@/engine/spreadsheet'
import type { CellData, SheetData, SortRule } from '@/types'

export function findLastDataRow(sheet: SheetData): number {
  let max = 0
  for (const cellId of Object.keys(sheet.cells)) {
    max = Math.max(max, cellToRef(cellId).row)
  }
  return max
}

export function findHeaderRow(sheet: SheetData): number {
  for (let r = 0; r < 5; r++) {
    let count = 0
    for (const cellId of Object.keys(sheet.cells)) {
      if (cellToRef(cellId).row === r) count++
    }
    if (count >= 2) return r
  }
  return 0
}

export type SortDirection = 'asc' | 'desc'

export interface SortPatch {
  writes: Record<string, CellData>
  deletes: string[]
}

function cloneCell(cell: CellData): CellData {
  return {
    ...cell,
    format: cell.format
      ? {
          ...cell.format,
          borders: cell.format.borders ? { ...cell.format.borders } : undefined,
          conditionalRules: cell.format.conditionalRules
            ? cell.format.conditionalRules.map((r) => ({ ...r, style: { ...r.style } }))
            : undefined,
        }
      : undefined,
    validation: cell.validation ? { ...cell.validation, values: cell.validation.values ? [...cell.validation.values] : undefined } : undefined,
  }
}

/**
 * Extract a sort key from a cell display value.
 * Numbers sort numerically, strings sort locale-aware.
 */
function extractSortKey(computed: string): number | string {
  const num = parseFloat(computed.replace(/[$€£¥,\s]/g, ''))
  return isNaN(num) ? computed.toLowerCase() : num
}

/**
 * Compare two sort keys with the given direction.
 * Numbers compare numerically, strings compare with localeCompare.
 */
function compareSortKeys(a: number | string, b: number | string, direction: SortDirection): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a
  }
  const aStr = String(a)
  const bStr = String(b)
  return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
}

/**
 * Single-column sort (backward compatible).
 */
export function computeSortedCellUpdates(
  sheet: SheetData,
  columnIndex: number,
  direction: SortDirection,
  getComputedValue: (row: number, col: number) => string,
): SortPatch {
  return computeMultiSortedCellUpdates(sheet, [{ column: columnIndex, direction }], getComputedValue)
}

/**
 * Multi-column sort: applies sort rules in priority order.
 * First rule is the primary sort, subsequent rules break ties.
 *
 * Inspired by Univer's SheetsSortService — adds tiered comparison and stable sort.
 */
export function computeMultiSortedCellUpdates(
  sheet: SheetData,
  rules: SortRule[],
  getComputedValue: (row: number, col: number) => string,
): SortPatch {
  if (rules.length === 0) return { writes: {}, deletes: [] }

  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const oldIds: string[] = []

  interface RowData {
    originalRow: number
    sortKeys: (number | string)[]
    cells: Record<string, CellData>
  }

  const rows: RowData[] = []

  for (let r = headerRow + 1; r <= lastRow; r++) {
    // Compute sort keys for all rule columns
    const sortKeys = rules.map((rule) => {
      const computed = getComputedValue(r, rule.column)
      return extractSortKey(computed)
    })

    // Collect all cells in this row
    const rowCells: Record<string, CellData> = {}
    for (const [cellId, cell] of Object.entries(sheet.cells)) {
      const ref = cellToRef(cellId)
      if (ref.row === r) {
        oldIds.push(cellId)
        rowCells[cellId] = cloneCell(cell)
      }
    }

    rows.push({ originalRow: r, sortKeys, cells: rowCells })
  }

  // Stable multi-key sort
  rows.sort((a, b) => {
    for (let i = 0; i < rules.length; i++) {
      const cmp = compareSortKeys(a.sortKeys[i], b.sortKeys[i], rules[i].direction)
      if (cmp !== 0) return cmp
    }
    // Stable: preserve original order for identical keys
    return a.originalRow - b.originalRow
  })

  // Rebuild cell map with new row positions
  const writes: Record<string, CellData> = {}
  for (let i = 0; i < rows.length; i++) {
    const targetRow = headerRow + 1 + i
    for (const [cellId, cell] of Object.entries(rows[i].cells)) {
      const ref = cellToRef(cellId)
      const newCellId = refToCell(targetRow, ref.col)
      writes[newCellId] = cloneCell(cell)
    }
  }

  const writeKeys = new Set(Object.keys(writes))
  const deletes = oldIds.filter((id) => !writeKeys.has(id))

  return { writes, deletes }
}

// ─── Validation Helpers (inspired by Univer's sort service) ─────────────────

/**
 * Check if a sort range contains merged cells that would be broken by sorting.
 * Returns true if it's safe to sort.
 */
export function isSortSafe(sheet: SheetData, startRow: number, endRow: number): boolean {
  if (!sheet.mergedCells?.length) return true

  for (const mergeId of sheet.mergedCells) {
    const ref = cellToRef(mergeId)
    // If a merged cell's anchor is within the sort range, check if it spans rows
    if (ref.row >= startRow && ref.row <= endRow) {
      // For now, we consider any merge in the sort range as potentially unsafe
      // A more sophisticated check would parse the merge extent
      return false
    }
  }
  return true
}

/**
 * Check if the sort range contains any non-empty data.
 */
export function hasSortableData(
  sheet: SheetData,
  columnIndex: number,
  getComputedValue: (row: number, col: number) => string,
): boolean {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const val = getComputedValue(r, columnIndex)
    if (val.trim() !== '') return true
  }
  return false
}
