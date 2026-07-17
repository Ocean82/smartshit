import { describe, expect, it } from 'vitest'
import { resolveAnalysisTarget } from './analysisTarget'
import { parseUserIntent } from './intentParser'
import { runQueryFromIntent } from './queryEngine'
import { createEmptyWorkbook, createEmptySheet, refToCell } from '@/engine/spreadsheet'
import type { SheetData, WorkbookData } from '@/types'
import type { AttachedFilePreview } from '@/ai/types'

function makeBudgetSheet(name: string, rentAmount: number): { workbook: WorkbookData; sheet: SheetData } {
  const sheet = createEmptySheet(name)
  sheet.cells = {
    A1: { value: 'Category' },
    B1: { value: 'Amount' },
    A2: { value: 'Rent' },
    B2: { value: rentAmount },
    A3: { value: 'Food' },
    B3: { value: 400 },
  }
  const workbook = createEmptyWorkbook(name)
  workbook.sheets = [sheet]
  workbook.activeSheetId = sheet.id
  return { workbook, sheet }
}

describe('resolveAnalysisTarget', () => {
  it('uses attached workbook cells for deterministic analysis', () => {
    const active = makeBudgetSheet('Active', 999)
    const attached = makeBudgetSheet('Attached', 2500)

    const getActiveValue = (row: number, col: number) => {
      const cellId = refToCell(row, col)
      const val = active.sheet.cells[cellId]?.value
      return val === null || val === undefined ? '' : String(val)
    }

    const attachedPreview: AttachedFilePreview = {
      fileName: 'budget.xlsx',
      workbook: attached.workbook,
      context: {
        workbookName: attached.workbook.name,
        activeSheet: attached.sheet.name,
        sheetNames: [attached.sheet.name],
        sheetSummaries: [],
        selectedCells: [],
        dimensions: { rows: 4, cols: 2, populatedCells: 6 },
        headers: ['Category', 'Amount'],
        sampleRows: [],
        sampleRowsTruncated: false,
        selectionSnapshot: {},
        insights: { headerRow: 0, headers: ['Category', 'Amount'], columnStats: [] },
      },
    }

    const target = resolveAnalysisTarget({
      workbook: active.workbook,
      sheet: active.sheet,
      selection: null,
      getComputedValue: getActiveValue,
      attachedPreview,
    })

    expect(target.isAttached).toBe(true)
    expect(target.sheet.name).toBe('Attached')

    const intent = parseUserIntent('Show top 1 expenses')
    const result = runQueryFromIntent(target.sheet, intent, target.getComputedValue)
    expect(result?.success).toBe(true)
    const rows = result?.data as Array<{ value: number }>
    expect(rows[0].value).toBe(2500)
  })
})
