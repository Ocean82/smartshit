import type { WorkbookData } from '@/types'

/**
 * Returns true when the workbook contains any meaningful user data —
 * cells with a value/formula, custom column widths or row heights, merged
 * cells, or charts. Used to decide whether replacing the workbook warrants
 * a confirmation.
 */
export function workbookHasContent(wb: WorkbookData): boolean {
  return wb.sheets.some((sheet) => {
    if (sheet.mergedCells && sheet.mergedCells.length > 0) return true
    if (sheet.rowHeights && Object.keys(sheet.rowHeights).length > 0) return true
    if (sheet.columnWidths && Object.keys(sheet.columnWidths).length > 0) return true
    if (sheet.charts && sheet.charts.length > 0) return true
    const cellKeys = Object.keys(sheet.cells)
    if (cellKeys.length === 0) return false
    for (const key of cellKeys) {
      const cell = sheet.cells[key]
      if (cell?.value != null || cell?.formula) return true
    }
    return false
  })
}