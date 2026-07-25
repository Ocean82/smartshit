import { describe, expect, it } from 'vitest'
import { findSummaryRowIndexes } from './sheetRows'
import type { SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'

function makeSheet(cells: SheetData['cells']): SheetData {
  return {
    id: 'sheet',
    name: 'Data',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
}

function getter(sheet: SheetData) {
  return (row: number, col: number) => String(sheet.cells[refToCell(row, col)]?.value ?? '')
}

describe('findSummaryRowIndexes', () => {
  it('detects exact, known imported, and formula-backed summary labels', () => {
    const sheet = makeSheet({
      A1: { value: 'Item' }, B1: { value: 'Amount' },
      A2: { value: 'Total' }, B2: { value: 10 },
      A3: { value: 'Total Expenses' }, B3: { value: 20 },
      A4: { value: 'Total Custom Metric' }, B4: { value: 30, formula: '=SUM(B2:B3)' },
    })
    expect([...findSummaryRowIndexes(sheet, getter(sheet))]).toEqual([1, 2, 3])
  })

  it('does not classify an ordinary Total-prefixed merchant as a summary', () => {
    const sheet = makeSheet({
      A1: { value: 'Merchant' }, B1: { value: 'Amount' },
      A2: { value: 'Other Store' }, B2: { value: 10 },
      A3: { value: 'Total Wine' }, B3: { value: 20 },
    })
    expect(findSummaryRowIndexes(sheet, getter(sheet)).has(2)).toBe(false)
  })
})
