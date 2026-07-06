import * as XLSX from 'xlsx'
import { v4 as uuid } from 'uuid'
import type { WorkbookData, SheetData, CellData } from '@/types'
import {
  createEmptyWorkbook,
  createEmptySheet,
  refToCell,
  cellToRef,
} from '@/engine/spreadsheet'

const MAX_ROWS = 200
const MAX_COLS = 26

function coerceCellValue(raw: string): string | number | null {
  const trimmed = raw.trim()
  if (trimmed.startsWith('=')) return trimmed
  const num = Number(trimmed)
  if (trimmed !== '' && Number.isFinite(num)) return num
  return trimmed || null
}

function sheetToMatrix(sheet: SheetData): (string | number | null)[][] {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    maxRow = Math.max(maxRow, ref.row)
    maxCol = Math.max(maxCol, ref.col)
  }

  const rows = Math.max(maxRow + 1, 1)
  const cols = Math.max(maxCol + 1, 1)
  const matrix: (string | number | null)[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null),
  )

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    const ref = cellToRef(cellId)
    const display = cell.formula ?? cell.value
    matrix[ref.row][ref.col] = display
  }

  return matrix
}

function parseSheetRows(rows: (string | number | null)[][]): Record<string, CellData> {
  const cells: Record<string, CellData> = {}
  rows.slice(0, MAX_ROWS).forEach((row, rowIndex) => {
    row.slice(0, MAX_COLS).forEach((value, colIndex) => {
      if (value === undefined || value === null || value === '') return
      const cellId = refToCell(rowIndex, colIndex)
      const coerced = coerceCellValue(String(value))
      if (typeof coerced === 'string' && coerced.startsWith('=')) {
        cells[cellId] = { value: null, formula: coerced }
      } else {
        cells[cellId] = { value: coerced }
      }
    })
  })
  return cells
}

export async function importWorkbookFromFile(file: File): Promise<WorkbookData> {
  const buffer = await file.arrayBuffer()
  const book = XLSX.read(buffer, { type: 'array' })
  const baseName = file.name.replace(/\.(csv|xlsx|xls)$/i, '')

  const sheets: SheetData[] = book.SheetNames.map((name) => {
    const sheet = createEmptySheet(name.slice(0, 31))
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[name], {
      header: 1,
      raw: false,
      defval: null,
    })
    sheet.cells = parseSheetRows(rows)
    return sheet
  })

  if (!sheets.length) {
    return createEmptyWorkbook(baseName)
  }

  return {
    id: uuid(),
    name: baseName,
    sheets,
    activeSheetId: sheets[0].id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function exportWorkbookToXlsx(workbook: WorkbookData, filename?: string): void {
  const book = XLSX.utils.book_new()
  for (const sheet of workbook.sheets) {
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(sheetToMatrix(sheet)),
      sheet.name.slice(0, 31),
    )
  }
  const safeName = (filename ?? workbook.name).replace(/[^\w\s-]/g, '').trim() || 'workbook'
  XLSX.writeFile(book, `${safeName}.xlsx`)
}

export function exportSheetToCsv(sheet: SheetData, filename: string): void {
  const matrix = sheetToMatrix(sheet)
  const csv = matrix.map((row) =>
    row
      .map((cell) => {
        const val = cell == null ? '' : String(cell)
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
      })
      .join(','),
  ).join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
