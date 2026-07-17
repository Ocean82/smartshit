import type { WorkbookData, SheetData, Selection } from '@/types'
import { refToCell, cellToRef, colToLetter } from '@/engine/spreadsheet'
import { cellScalar } from '@/lib/formatUtils'
import { computeSheetInsights, type SheetInsights } from '@/ai/sheetInsights'
import { buildSheetProfile } from '@/ai/sheetProfile'
import type { SheetProfile } from '@/ai/types'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'

export interface SheetDimensions {
  rows: number
  cols: number
  populatedCells: number
}

export interface SheetSummary {
  name: string
  rows: number
  cols: number
  headers: string[]
  populatedCells: number
  isActive: boolean
}

export interface SpreadsheetContextPayload {
  workbookName: string
  activeSheet: string
  sheetNames: string[]
  /** Lightweight overview of every sheet in the workbook */
  sheetSummaries: SheetSummary[]
  selectedCells: string[]
  dimensions: SheetDimensions
  headers: string[]
  sampleRows: string[][]
  sampleRowsTruncated: boolean
  selectionSnapshot: Record<string, string | number | null>
  insights: SheetInsights
  profile?: SheetProfile
  deterministicSummary?: string
  /** @deprecated kept for backward compatibility */
  cellSummary?: Record<string, string | number | boolean | null>
}

const MAX_SAMPLE_ROWS = AI_ANALYSIS_CONFIG.maxRowsPreview

function getSheetBounds(sheet: SheetData): { maxRow: number; maxCol: number } {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }
  return { maxRow, maxCol }
}

function cellDisplayValue(
  sheet: SheetData,
  row: number,
  col: number,
  getComputedValue: (row: number, col: number) => string,
): string | number | null {
  const cellId = refToCell(row, col)
  const cell = sheet.cells[cellId]
  if (cell?.formula) return cell.formula
  if (cell?.value !== null && cell?.value !== undefined && cell?.value !== '') return cellScalar(cell.value)
  const computed = getComputedValue(row, col)
  if (!computed) return null
  const num = Number(computed)
  return Number.isFinite(num) && computed.trim() !== '' ? num : computed
}

function buildSampleRows(
  sheet: SheetData,
  maxRow: number,
  maxCol: number,
  getComputedValue: (row: number, col: number) => string,
): string[][] {
  const rows: string[][] = []
  const limit = Math.min(maxRow + 1, MAX_SAMPLE_ROWS)

  for (let r = 0; r < limit; r++) {
    const rowValues: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const val = cellDisplayValue(sheet, r, c, getComputedValue)
      rowValues.push(val === null ? '' : String(val))
    }
    if (rowValues.some((v) => v !== '')) rows.push(rowValues)
  }

  return rows
}

/** Cheap per-sheet overview so the model knows about other tabs. */
export function summarizeSheet(sheet: SheetData, isActive: boolean): SheetSummary {
  const { maxRow, maxCol } = getSheetBounds(sheet)
  const headers: string[] = []
  const headerLimit = Math.min(maxCol, 11)
  for (let c = 0; c <= headerLimit; c++) {
    const cell = sheet.cells[refToCell(0, c)]
    const letter = colToLetter(c)
    const raw = cell?.value
    const label = raw !== null && raw !== undefined && String(raw).trim() !== ''
      ? String(raw).trim()
      : `Column ${letter}`
    headers.push(label)
  }
  return {
    name: sheet.name,
    rows: Object.keys(sheet.cells).length === 0 ? 0 : maxRow + 1,
    cols: Object.keys(sheet.cells).length === 0 ? 0 : maxCol + 1,
    headers,
    populatedCells: Object.keys(sheet.cells).length,
    isActive,
  }
}

export function buildSpreadsheetContext(
  workbook: WorkbookData,
  sheet: SheetData,
  selection: Selection | null,
  getComputedValue: (row: number, col: number) => string,
): SpreadsheetContextPayload {
  const selectedCells: string[] = []
  const selectionSnapshot: Record<string, string | number | null> = {}

  if (selection) {
    const minR = Math.min(selection.startRow, selection.endRow)
    const maxR = Math.max(selection.startRow, selection.endRow)
    const minC = Math.min(selection.startCol, selection.endCol)
    const maxC = Math.max(selection.startCol, selection.endCol)
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const ref = refToCell(r, c)
        selectedCells.push(ref)
        const val = cellDisplayValue(sheet, r, c, getComputedValue)
        if (val !== null) selectionSnapshot[ref] = val
      }
    }
  }

  const { maxRow, maxCol } = getSheetBounds(sheet)
  const insights = computeSheetInsights(sheet, getComputedValue)
  const profile = buildSheetProfile(sheet, getComputedValue)
  const sampleRows = buildSampleRows(sheet, maxRow, maxCol, getComputedValue)
  const sampleRowsTruncated = maxRow + 1 > MAX_SAMPLE_ROWS
  const sheetSummaries = workbook.sheets.map((s) => summarizeSheet(s, s.id === sheet.id))

  return {
    workbookName: workbook.name,
    activeSheet: sheet.name,
    sheetNames: workbook.sheets.map((s) => s.name),
    sheetSummaries,
    selectedCells,
    dimensions: {
      rows: maxRow + 1,
      cols: maxCol + 1,
      populatedCells: Object.keys(sheet.cells).length,
    },
    headers: insights.headers,
    sampleRows,
    sampleRowsTruncated,
    selectionSnapshot,
    insights,
    profile,
  }
}
