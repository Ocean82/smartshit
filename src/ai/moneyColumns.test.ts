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
import { detectPurpose } from './sheetProfile'
import { matchGoal } from './goals/matchGoal'
import { listSuggestedGoals } from './goals/suggestGoals'
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

  it('still offers totals on hours: "total hours by employee" and the suggestion chips work', () => {
    const profile = buildSheetProfile(sheet, get)
    // One measure column needed: drop Overtime/Total Hours so Hours is the only one.
    const oneMeasure = { ...profile, columns: profile.columns.filter((c) => !['Overtime', 'Total Hours'].includes(c.name)) }
    const match = matchGoal({ profile: oneMeasure, utterance: 'hours by name' })
    expect(match.status).toBe('matched')
    expect(match.slots.amountColumn).toBe('C') // Hours
    expect(listSuggestedGoals(oneMeasure).map((g) => g.goal?.id)).toContain('total')

    // Several measures: ask which, in plain words, and offer each as a chip.
    const many = matchGoal({ profile, utterance: 'total hours' })
    expect(many.status).toBe('ambiguous')
    expect(many.question).toMatch(/multiple number columns/)
    expect(many.question).toContain('Hours (C)')
    expect(many.question).not.toContain('Employee ID')
  })

  it('still shows money with a dollar sign on a budget', () => {
    const { sheet: b, get: g } = sheetOf([
      ['Category', 'Amount'], ['Rent', 1500], ['Food', 400], ['Fun', 60], ['Gas', 80], ['Big', 9000],
    ])
    const text = formatInsights(computeSheetInsights(b, g))
    expect(text).toContain('$')
  })
})

describe('per-unit prices are not spending', () => {
  it('does not report an inventory\'s summed Unit Cost as total expenses', () => {
    const { sheet, get } = sheetOf([
      ['SKU', 'Item', 'Qty On Hand', 'Unit Cost'],
      [100234, 'Bolt', 450, 0.12],
      [100235, 'Nut', 900, 0.05],
      [100410, 'Washer', 1200, 0.02],
    ])
    const ins = computeSheetInsights(sheet, get)
    expect(ins.totalExpenses).toBeUndefined()
    expect(ins.categoryTotals).toBeUndefined()
  })

  it('totals an invoice by its Amount, not its per-unit Price', () => {
    const { sheet, get } = sheetOf([
      ['Item', 'Qty', 'Price', 'Amount'],
      ['Design', 10, 50, 500],
      ['Hosting', 2, 25, 50],
    ])
    expect(computeSheetInsights(sheet, get).totalExpenses).toBe(550)
  })

  it('still totals a shopping list whose only money column is Price', () => {
    const { sheet, get } = sheetOf([['Item', 'Price'], ['Milk', 3], ['Bread', 2.5]])
    expect(computeSheetInsights(sheet, get).totalExpenses).toBe(5.5)
  })
})

describe('detectPurpose matches whole words', () => {
  it.each([
    [['Factual Notes', 'Value'], 'generic'],
    [['Syntax', 'Count'], 'generic'],
    [['Ideal Weight', 'Kg'], 'generic'],
    [['Employee', 'Billable Hours'], 'generic'],
    [['Category', 'Budget', 'Actual'], 'budget'],
    [['Invoice #', 'Client', 'Tax'], 'invoice'],
    [['Billing Date', 'Amount'], 'invoice'],
    [['SKU', 'Stock Level'], 'inventory'],
    [['Product', 'Sales'], 'sales'],
  ] as const)('%j → %s', (headers, purpose) => {
    expect(detectPurpose([...headers])).toBe(purpose)
  })
})
