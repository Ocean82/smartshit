import { describe, expect, it } from 'vitest'
import { parseMessage, type SheetContext } from './parser'
import type { ColumnProfile } from '@/ai/types'

function column(
  name: string,
  letter: string,
  dtype: 'number' | 'text',
  role: ColumnProfile['role'],
  samples: Array<string | number> = [],
): ColumnProfile {
  return {
    name,
    column: letter,
    dtype,
    role,
    nonNullCount: 4,
    nullCount: 0,
    uniqueCount: 4,
    sampleValues: samples,
  }
}

function context(columns: ColumnProfile[]): SheetContext {
  return {
    headerRow: 0,
    lastDataRow: 4,
    lastDataCol: columns.length - 1,
    headers: columns.map((item) => item.name),
    columns,
  }
}

const expenseContext = context([
  column('Category', 'A', 'text', 'category', ['Rent', 'Food']),
  column('Quantity', 'B', 'number', 'quantity', [1, 2]),
  column('Status', 'C', 'text', 'label', ['Paid', 'Overdue']),
  column('Amount', 'D', 'number', 'amount', [1500, 400]),
])

describe('reported agent gap regressions', () => {
  it('uses the detected amount role for max/min rather than defaulting to B', () => {
    expect(parseMessage("what's my biggest expense?", expenseContext).calls[0]).toMatchObject({
      tool: 'find_max',
      params: { column: 'D' },
    })
    expect(parseMessage('what is my cheapest expense?', expenseContext).calls[0]).toMatchObject({
      tool: 'find_min',
      params: { column: 'D' },
    })
  })

  it('clarifies when more than one amount column is equally plausible', () => {
    const ambiguous = context([
      column('Budget', 'B', 'number', 'amount'),
      column('Actual', 'C', 'number', 'amount'),
    ])
    const result = parseMessage('find the highest value', ambiguous)
    expect(result.understood).toBe(true)
    expect(result.calls).toHaveLength(0)
    expect(result.explanation).toMatch(/which numeric column/i)
  })

  it('parses comparative highlight phrasing and detected amount targets', () => {
    const allNumeric = parseMessage('highlight anything above $1,000 in red', expenseContext)
    expect(allNumeric.calls[0]).toMatchObject({
      tool: 'format_cells',
      params: {
        condition: { operator: 'gt', value: 1000 },
        bgColor: '#FEE2E2',
      },
    })

    const expenses = parseMessage('highlight expenses under 500', expenseContext)
    expect(expenses.calls[0].params).toMatchObject({
      range: 'D',
      condition: { operator: 'lt', value: 500 },
    })
  })

  it('routes natural count questions to a read-only count tool', () => {
    const result = parseMessage('count how many are overdue', expenseContext)
    expect(result.calls[0]).toMatchObject({
      tool: 'count_rows',
      params: { operator: 'equals', value: 'overdue' },
    })

    expect(parseMessage('how many rows have an overdue status?', expenseContext).calls[0]).toMatchObject({
      tool: 'count_rows',
      params: { column: 'C', operator: 'equals', value: 'overdue' },
    })

    expect(parseMessage('how many rows are over $500?', expenseContext).calls[0]).toMatchObject({
      tool: 'count_rows',
      params: { column: 'D', operator: 'gt', value: 500 },
    })
  })

  it('parses explicit COUNT and conditional formula requests', () => {
    expect(parseMessage('add a COUNT formula for column B').calls[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'B', formula: '=COUNT' },
    })
    expect(parseMessage('add a COUNT formula in D2 for C2:C20').calls[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'D2', formula: '=COUNT(C2:C20)' },
    })

    expect(parseMessage('add a COUNTIF formula in D2 to count C2:C20 equal to Overdue').calls[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'D2', formula: '=COUNTIF(C2:C20,"Overdue")' },
    })

    expect(parseMessage('add a SUMIF formula in E2 to sum B2:B20 where C2:C20 equals Paid').calls[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'E2', formula: '=SUMIF(C2:C20,"Paid",B2:B20)' },
    })
  })

  it('parses explicit IF and exact-match VLOOKUP formula requests', () => {
    expect(parseMessage('add an IF formula in D2: if C2 is Overdue then Late otherwise OK').calls[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'D2', formula: '=IF(C2="Overdue","Late","OK")' },
    })

    expect(parseMessage('add a VLOOKUP formula in D2 to look up A2 in Sheet2!A2:C100 return column 3').calls[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'D2', formula: '=VLOOKUP(A2,Sheet2!A2:C100,3,FALSE)' },
    })
  })

  it('routes supported export formats locally and clarifies a missing format', () => {
    expect(parseMessage('export this as CSV').calls[0]).toMatchObject({
      tool: 'export_data',
      params: { format: 'csv' },
    })
    expect(parseMessage('convert this to Excel').calls[0].params).toMatchObject({ format: 'xlsx' })
    const missing = parseMessage('export my data')
    expect(missing.understood).toBe(true)
    expect(missing.calls).toHaveLength(0)
    expect(missing.explanation).toMatch(/CSV.*Excel.*JSON/i)

    expect(parseMessage('put export in A1').calls[0]).toMatchObject({
      tool: 'set_cell',
      params: { cell: 'A1', value: 'export' },
    })
  })
})
