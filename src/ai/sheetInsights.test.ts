import { expect, it } from 'vitest'
import { computeSheetInsights } from './sheetInsights'
import type { SheetData } from '@/types'

it('uses computed formula results in numeric insights', () => {
  const sheet: SheetData = {
    id: 'sheet',
    name: 'Calculated',
    cells: {
      A1: { value: 'Category' },
      B1: { value: 'Amount' },
      A2: { value: 'Rent' },
      B2: { value: null, formula: '=100+25' },
      A3: { value: 'Total Expenses' },
      B3: { value: null, formula: '=SUM(B2:B2)' },
    },
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
  const insights = computeSheetInsights(sheet, (row, col) => (
    (row === 1 || row === 2) && col === 1
      ? '125'
      : String(sheet.cells[`${String.fromCharCode(65 + col)}${row + 1}`]?.value ?? '')
  ))

  expect(insights.columnStats.find((column) => column.column === 'B')?.sum).toBe(125)
  expect(insights.topExpenses?.[0]).toMatchObject({ label: 'Rent', amount: 125 })
  expect(insights.totalExpenses).toBe(125)
})
