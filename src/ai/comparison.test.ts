import { describe, expect, it } from 'vitest'
import { queryComparison } from './comparison'
import { createEmptySheet, refToCell } from '@/engine/spreadsheet'
import type { SheetData, WorkbookData } from '@/types'

function workbookWith(sheets: SheetData[], active = sheets[0]): WorkbookData {
  return {
    id: 'wb',
    name: 'Comparison',
    sheets,
    activeSheetId: active.id,
    createdAt: 0,
    updatedAt: 0,
  }
}

function getter(workbook: WorkbookData) {
  return (sheetId: string, row: number, col: number) => {
    const sheet = workbook.sheets.find((candidate) => candidate.id === sheetId)
    const cell = sheet?.cells[refToCell(row, col)]
    return String(cell?.value ?? '')
  }
}

function monthlySheet(id: string, name: string, values: number[]): SheetData {
  const sheet = createEmptySheet(name)
  sheet.id = id
  sheet.cells = {
    A1: { value: 'Category' },
    D1: { value: 'Amount' },
    A2: { value: 'Rent' },
    D2: { value: values[0] },
    A3: { value: 'Food' },
    D3: { value: values[1] },
    A4: { value: 'Total' },
    D4: { value: values[0] + values[1] },
  }
  return sheet
}

describe('queryComparison', () => {
  it('compares amount-role totals across named sheets without double-counting totals rows', () => {
    const january = monthlySheet('jan', 'January', [100, 50])
    const february = monthlySheet('feb', 'February', [200, 50])
    const workbook = workbookWith([january, february], january)

    const result = queryComparison(
      workbook,
      january,
      'Compare January and February totals',
      getter(workbook),
    )

    expect(result.success).toBe(true)
    expect(result.message).toContain('| Amount | $150 | $250 |')
    expect(result.message).toContain('$100 (66.7%) higher than January')
    expect(result.message).not.toContain('$300')
  })

  it('compares two numeric columns on the active sheet', () => {
    const sheet = createEmptySheet('Budget')
    sheet.cells = {
      A1: { value: 'Category' },
      B1: { value: 'Budget' },
      C1: { value: 'Actual' },
      A2: { value: 'Rent' }, B2: { value: 100 }, C2: { value: 120 },
      A3: { value: 'Food' }, B3: { value: 50 }, C3: { value: 40 },
    }
    const workbook = workbookWith([sheet])
    const result = queryComparison(workbook, sheet, 'compare Budget and Actual', getter(workbook))

    expect(result.message).toContain('| Total | $150 | $160 |')
    expect(result.message).toContain('$10 (6.7%) higher than Budget')
  })

  it('compares two labeled periods within one sheet', () => {
    const sheet = createEmptySheet('Monthly')
    sheet.cells = {
      A1: { value: 'Month' },
      B1: { value: 'Amount' },
      A2: { value: 'January' }, B2: { value: 100 },
      A3: { value: 'February' }, B3: { value: 125 },
    }
    const workbook = workbookWith([sheet])
    const result = queryComparison(workbook, sheet, 'Compare January and February', getter(workbook))

    expect(result.message).toContain('| Amount | $100 | $125 |')
    expect(result.message).toContain('February is $25 (25.0%) higher than January')
  })

  it('uses the previous workbook tab for relative month-sheet wording', () => {
    const january = monthlySheet('jan', 'Jan data', [100, 50])
    const february = monthlySheet('feb', 'Feb data', [200, 50])
    const workbook = workbookWith([january, february], february)
    const result = queryComparison(
      workbook,
      february,
      "How does this month's sheet compare to last month's sheet?",
      getter(workbook),
    )

    expect(result.message).toContain('| Metric | Jan data | Feb data |')
  })
})
