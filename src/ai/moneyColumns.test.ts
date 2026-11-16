/**
 * Numbers are money only on evidence.
 *
 * Reproduced 2026-11-15: any column that was mostly numbers was classified as
 * money, so chat, the insight cards, the makeover and the model's prompt
 * treated employee IDs, bins, hours and scores as dollars ("Total expenses:
 * $26.50" on a timesheet). Money now needs a money word in the header,
 * currency formatting, or currency symbols in the cells.
 */
import { describe, expect, it } from 'vitest'
import { buildSheetProfile, inferRole } from './sheetProfile'
import { computeSheetInsights } from './sheetInsights'
import { formatInsights, formatProfile } from './responseBuilder'
import { refToCell } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'

function sheetOf(rows: (string | number)[][], format?: Record<string, string>): { sheet: SheetData; get: (r: number, c: number) => string } {
  const cells: SheetData['cells'] = {}
  rows.forEach((row, r) => row.forEach((v, c) => {
    const id = refToCell(r, c)
    cells[id] = format?.[id] ? { value: v, format: { numberFormat: format[id] } } : { value: v }
  }))
  const sheet = { id: 's', name: 'S', cells, columnWidths: {}, rowHeights: {} } as SheetData
  return { sheet, get: (r, c) => String(cells[refToCell(r, c)]?.value ?? '') }
}

// Ten ordinary days and one 40-hour entry, so the outlier rule fires on Hours.
const timesheet: (string | number)[][] = [
  ['Employee ID', 'Name', 'Hours', 'Overtime', 'Project Code', 'Total Hours'],
  ...Array.from({ length: 10 }, (_, i) => [5012 + i, `P${i}`, i % 2 ? 7.5 : 8, i % 3, 7731, 8 + (i % 3)]),
  [5099, 'Ed', 40, 0, 8810, 40],
]

describe('inferRole: money only on evidence', () => {
  it.each([
    // [header, values, expected]
    ['Employee ID', [5012, 5013, 5014], 'id'],
    ['Item ID', [1, 2, 3], 'id'],
    ['SKU', [100234, 100235], 'id'],
    ['Order #', [9001, 9002], 'id'],
    ['Phone Number', [5551234, 5559876], 'id'],
    ['Bin', [12, 12, 14], 'id'],
    ['Badge', [88123, 88124, 88125], 'id'],
    ['Hours', [8, 7.5, 8], 'quantity'],
    ['Total Hours', [9, 7.5, 10], 'quantity'],
    ['Budget Hours', [40, 40], 'quantity'],
    ['Qty On Hand', [450, 900], 'quantity'],
    ['Reorder Point', [100, 200], 'quantity'],
    ['Score', [72, 91, 64], 'quantity'],
    ['Number of Units', [3, 4], 'quantity'],
    ['Value', [10, 20], 'quantity'],
    // Real money keeps working
    ['Unit Cost', [0.12, 0.05], 'amount'],
    ['Price per Unit', [4.5, 3], 'amount'],
    ['Amount Due', [120, 80], 'amount'],
    ['Paid', [1500, 460], 'amount'],
    ['Actual', [1500, 460], 'amount'],
    ['Total', [1960, 400], 'amount'],
    ['Hourly Rate', [25, 30], 'amount'],
    ['Cost', ['$1,200', '$40'], 'amount'],
    // Other roles unchanged
    ['Tax Rate', [0.07, 0.08], 'percentage'],
    ['Margin %', [12, 15], 'percentage'],
    ['Date', [45672, 45673], 'date'],
    ['Category', ['Rent', 'Food'], 'category'],
    ['Expense Category', ['Rent', 'Food'], 'category'],
  ] as const)('%s → %s', (header, values, expected) => {
    expect(inferRole(header, [...values])).toBe(expected)
  })

  it('treats a header-less number column as a plain number, or as an id when it looks like one', () => {
    expect(inferRole('Column B', [3, 7, 3, 9])).toBe('quantity')
    expect(inferRole('Column B', [10234, 10235, 10236])).toBe('id')
    expect(inferRole('Column B', ['00123', '00124', '00125'])).toBe('id')
  })

  it('honours currency formatting the user applied', () => {
    const { sheet, get } = sheetOf(
      [['Jan', 'Feb'], [1200, 1300], [40, 55]],
      { A2: 'currency', A3: 'currency', B2: 'accounting', B3: 'accounting' },
    )
    expect(buildSheetProfile(sheet, get).columns.map((c) => c.role)).toEqual(['amount', 'amount'])
  })
})

describe('a timesheet is never described as money', () => {
  const { sheet, get } = sheetOf(timesheet)

  it('reports no expenses and no per-person money totals', () => {
    const ins = computeSheetInsights(sheet, get)
    expect(ins.totalExpenses).toBeUndefined()
    expect(ins.categoryTotals).toBeUndefined()
  })

  it('leaves identifiers out of sums and outliers, and marks nothing as money', () => {
    const ins = computeSheetInsights(sheet, get)
    const labels = ins.columnStats.map((s) => s.label)
    expect(labels).not.toContain('Employee ID')
    expect(labels).not.toContain('Project Code')
    expect(ins.columnStats.every((s) => !s.money)).toBe(true)
    expect((ins.outliers ?? []).every((o) => o.column !== 'Employee ID')).toBe(true)
  })

  it('chat text has no dollar signs', () => {
    const ins = computeSheetInsights(sheet, get)
    expect(ins.outliers?.length).toBeGreaterThan(0) // 40 hours stands out
    expect(formatInsights(ins)).not.toContain('$')
    expect(formatProfile(buildSheetProfile(sheet, get))).not.toContain('$')
  })

  it('still shows money with a dollar sign on a budget', () => {
    const { sheet: b, get: g } = sheetOf([
      ['Category', 'Amount'], ['Rent', 1500], ['Food', 400], ['Fun', 60], ['Gas', 80], ['Big', 9000],
    ])
    const text = formatInsights(computeSheetInsights(b, g))
    expect(text).toContain('$')
  })
})
