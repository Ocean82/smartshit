import { describe, expect, it } from 'vitest'
import { queryTopN, queryFilter, queryAggregate, runQueryFromIntent } from './queryEngine'
import { parseUserIntent } from '@/ai/intentParser'
import { computeSheetInsights } from '@/ai/sheetInsights'
import type { SheetData } from '@/types'

const getter = (sheet: SheetData) => (row: number, col: number) => {
  const cellId = `${String.fromCharCode(65 + col)}${row + 1}`
  const val = sheet.cells[cellId]?.value
  return val === null || val === undefined ? '' : String(val)
}

const sheet: SheetData = {
  id: 's1',
  name: 'Budget',
  cells: {
    A1: { value: 'Category' },
    B1: { value: 'Amount' },
    A2: { value: 'Rent' },
    B2: { value: 1500 },
    A3: { value: 'Food' },
    B3: { value: 400 },
    A4: { value: 'Travel' },
    B4: { value: 200 },
  },
  columnWidths: {},
  rowHeights: {},
  charts: [],
  filters: [],
  sortConfig: undefined,
}

describe('queryTopN', () => {
  it('returns top expenses by amount', () => {
    const result = queryTopN(sheet, 'B', 2, false, getter(sheet))
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
    expect((result.data as Array<{ value: number }>).length).toBe(2)
    expect((result.data as Array<{ value: number }>)[0].value).toBe(1500)
  })
})

const varianceSheet: SheetData = {
  id: 's2',
  name: 'Variance',
  cells: {
    A1: { value: 'Category' },
    B1: { value: 'Budget' },
    C1: { value: 'Actual' },
    A2: { value: 'Rent' },
    B2: { value: 1500 },
    C2: { value: 1600 },
    A3: { value: 'Food' },
    B3: { value: 400 },
    C3: { value: 350 },
  },
  columnWidths: {},
  rowHeights: {},
  charts: [],
  filters: [],
  sortConfig: undefined,
}

describe('queryFilter', () => {
  it('returns rows where actual exceeds budget', () => {
    const result = queryFilter(varianceSheet, 'Actual', 'gt', 'Budget', getter(varianceSheet))
    expect(result.success).toBe(true)
    const rows = result.data as Array<{ row: number; value: number }>
    expect(rows.length).toBe(1)
    expect(rows[0].row).toBe(2)
    expect(rows[0].value).toBe(1600)
  })

  it('supports fuzzy header matching', () => {
    const result = queryTopN(sheet, 'amount spent', 1, false, getter(sheet))
    expect(result.success).toBe(true)
    const rows = result.data as Array<{ value: number }>
    expect(rows[0].value).toBe(1500)
  })

  it('returns a clear error when column is missing', () => {
    const result = queryAggregate(sheet, 'MissingColumn', 'sum', getter(sheet))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Could not find|No numeric values found/i)
  })

  it('uses computed formula values and excludes totals rows', () => {
    const formulaSheet: SheetData = {
      ...sheet,
      id: 'formula',
      cells: {
        A1: { value: 'Category' }, B1: { value: 'Amount' },
        A2: { value: 'Rent' }, B2: { value: null, formula: '=100+25' },
        A3: { value: 'Food' }, B3: { value: 25 },
        A4: { value: 'Total Expenses' }, B4: { value: null, formula: '=SUM(B2:B3)' },
      },
    }
    const computed = (row: number, col: number) => {
      if (col === 1 && row === 1) return '125'
      if (col === 1 && row === 3) return '150'
      return getter(formulaSheet)(row, col)
    }
    const result = queryAggregate(formulaSheet, 'Amount', 'sum', computed)
    expect(result.data).toMatchObject({ result: 150, count: 2 })
    const top = queryTopN(formulaSheet, 'Amount', 1, false, computed)
    expect((top.data as Array<{ value: number }>)[0].value).toBe(125)
  })

  it('uses detected numeric insights instead of defaulting top-N queries to B', () => {
    const amountInD: SheetData = {
      ...sheet,
      id: 'amount-d',
      cells: {
        A1: { value: 'Category' }, B1: { value: 'Quantity' }, D1: { value: 'Amount' },
        A2: { value: 'Rent' }, B2: { value: 1 }, D2: { value: 1500 },
        A3: { value: 'Food' }, B3: { value: 20 }, D3: { value: 400 },
      },
    }
    const getValue = getter(amountInD)
    const insights = computeSheetInsights(amountInD, getValue)
    const result = runQueryFromIntent(
      amountInD,
      parseUserIntent('Show top 1 expenses'),
      getValue,
      insights,
    )
    expect((result?.data as Array<{ value: number }>)[0].value).toBe(1500)
  })
})
