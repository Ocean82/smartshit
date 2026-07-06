import type { WorkbookData, SheetData, Selection } from '@/types'
import { refToCell, cellToRef } from '@/engine/spreadsheet'

export interface SpreadsheetContextPayload {
  workbookName: string
  activeSheet: string
  sheetNames: string[]
  selectedCells: string[]
  cellSummary: Record<string, string | number | boolean | null>
}

const MAX_SUMMARY_CELLS = 80

export function buildSpreadsheetContext(
  workbook: WorkbookData,
  sheet: SheetData,
  selection: Selection | null,
  getComputedValue: (row: number, col: number) => string,
): SpreadsheetContextPayload {
  const selectedCells: string[] = []
  if (selection) {
    const minR = Math.min(selection.startRow, selection.endRow)
    const maxR = Math.max(selection.startRow, selection.endRow)
    const minC = Math.min(selection.startCol, selection.endCol)
    const maxC = Math.max(selection.startCol, selection.endCol)
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        selectedCells.push(refToCell(r, c))
      }
    }
  }

  const cellSummary: Record<string, string | number | boolean | null> = {}
  const entries = Object.entries(sheet.cells).slice(0, MAX_SUMMARY_CELLS)
  for (const [cellId, cell] of entries) {
    const ref = cellToRef(cellId)
    const computed = getComputedValue(ref.row, ref.col)
    cellSummary[cellId] = cell.formula ?? cell.value ?? (computed || null)
  }

  return {
    workbookName: workbook.name,
    activeSheet: sheet.name,
    sheetNames: workbook.sheets.map((s) => s.name),
    selectedCells,
    cellSummary,
  }
}
