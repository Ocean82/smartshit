import type { CellChange, SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

export interface ResolvedDeleteRow {
  rowIndex: number
  rowNumber: number
  /** Snapshot used to refuse Apply if this row changed after preview. */
  signature: string
  summary: string
  changes: CellChange[]
}

/** Resolve the exact row once so preview and Apply cannot target different rows. */
export function resolveDeleteRow(
  sheet: SheetData,
  params: Record<string, unknown>,
  getComputedValue: (row: number, col: number) => string,
): ResolvedDeleteRow | null {
  let rowIndex = -1

  if (params.row != null) {
    const rowNumber = Number(params.row)
    if (!Number.isInteger(rowNumber) || rowNumber < 1) return null
    rowIndex = rowNumber - 1
    if (rowIndex > findLastDataRow(sheet)) return null
  } else if (typeof params.match === 'string' && params.match.trim()) {
    const needle = params.match.trim().toLowerCase()
    const headerRow = findHeaderRow(sheet)
    // Named deletion should never accidentally remove a matching header. An
    // explicit "delete row 1" can still remove the header after confirmation.
    const matchingRows = new Set<number>()
    for (const [cellId, cell] of Object.entries(sheet.cells)) {
      const { row, col } = cellToRef(cellId)
      if (row <= headerRow) continue
      const displayed = getComputedValue(row, col)
      const value = displayed || (cell.value == null ? '' : String(cell.value))
      if (value.toLowerCase().includes(needle)) matchingRows.add(row)
    }
    rowIndex = [...matchingRows].sort((a, b) => a - b)[0] ?? -1
  }

  if (rowIndex < 0) return null

  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    maxCol = Math.max(maxCol, cellToRef(cellId).col)
  }

  const headerRow = findHeaderRow(sheet)
  const parts: string[] = []
  const changes: CellChange[] = []
  const snapshot: string[] = []
  for (let col = 0; col <= maxCol; col++) {
    const cellId = refToCell(rowIndex, col)
    const cell = sheet.cells[cellId]
    const displayed = getComputedValue(rowIndex, col)
    const raw = displayed || String(cell?.formula ?? cell?.value ?? '')
    snapshot.push(raw)
    if (!cell && !displayed) continue
    const oldValue = cell?.value ?? (displayed || null)
    changes.push({
      cell: cellId,
      oldValue,
      newValue: null,
      oldFormula: cell?.formula,
    })

    if (parts.length < 4) {
      const header = getComputedValue(headerRow, col).trim() || `Column ${col + 1}`
      if (raw) parts.push(`${header}: ${raw}`)
    }
  }

  const signature = JSON.stringify(snapshot)
  if (typeof params.expectedRowSignature === 'string' && params.expectedRowSignature !== signature) {
    return null
  }

  return {
    rowIndex,
    rowNumber: rowIndex + 1,
    signature,
    summary: parts.join(', ') || `row ${rowIndex + 1}`,
    changes,
  }
}
