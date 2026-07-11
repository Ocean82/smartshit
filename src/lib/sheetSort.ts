import { cellToRef, refToCell } from '@/engine/spreadsheet'
import type { CellData, SheetData } from '@/types'

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
 * Pure sort: remaps full CellData for data rows and lists IDs to clear (ghost prevention).
 */
export function computeSortedCellUpdates(
  sheet: SheetData,
  columnIndex: number,
  direction: SortDirection,
  getComputedValue: (row: number, col: number) => string,
): SortPatch {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const oldIds: string[] = []
  const rows: Array<{ sortVal: number | string; cells: Record<string, CellData> }> = []

  for (let r = headerRow + 1; r <= lastRow; r++) {
    const computed = getComputedValue(r, columnIndex)
    const num = parseFloat(computed.replace(/[$,]/g, ''))
    const sortVal = isNaN(num) ? computed.toLowerCase() : num
    const rowCells: Record<string, CellData> = {}
    for (const [cellId, cell] of Object.entries(sheet.cells)) {
      const ref = cellToRef(cellId)
      if (ref.row === r) {
        oldIds.push(cellId)
        rowCells[cellId] = cloneCell(cell)
      }
    }
    rows.push({ sortVal, cells: rowCells })
  }

  rows.sort((a, b) => {
    if (typeof a.sortVal === 'number' && typeof b.sortVal === 'number') {
      return direction === 'asc' ? a.sortVal - b.sortVal : b.sortVal - a.sortVal
    }
    const aStr = String(a.sortVal)
    const bStr = String(b.sortVal)
    return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
  })

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
