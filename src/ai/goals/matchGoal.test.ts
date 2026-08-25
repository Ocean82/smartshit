import { describe, expect, it } from 'vitest'
import type { ColumnProfile, SheetProfile } from '@/ai/types'
import { executeGoal, listSuggestedGoals, matchGoal } from './index'

function col(
  name: string,
  letter: string,
  role: ColumnProfile['role'],
  samples: Array<string | number> = [1],
): ColumnProfile {
  return {
    name,
    column: letter,
    dtype: role === 'amount' ? 'number' : 'string',
    role,
    nonNullCount: 4,
    nullCount: 0,
    uniqueCount: 4,
    sampleValues: samples,
  }
}

function profile(columns: ColumnProfile[]): SheetProfile {
  return {
    name: 'Sheet1',
    rowCount: 5,
    colCount: columns.length,
    columns,
    detectedPurpose: 'budget',
    hasHeaders: true,
    hasTotalsRow: false,
  }
}

const expenses = profile([
  col('Date', 'A', 'date', ['2026-01-01']),
  col('Category', 'B', 'category', ['Rent', 'Food']),
  col('Amount', 'C', 'amount', [1500, 400]),
])

describe('matchGoal', () => {
  it('routes sum column B to total with that column', () => {
    const match = matchGoal({ profile: expenses, utterance: 'sum column C' })
    expect(match.status).toBe('matched')
    expect(match.goal?.id).toBe('total')
    expect(match.slots.amountColumn).toBe('C')
    expect(match.output).toBe('formula')
    expect(match.explain).toContain('Amount column = C')
  })

  it('resolves sum column Tax from the header', () => {
    const taxSheet = profile([
      col('Item', 'A', 'category'),
      col('Tax', 'C', 'amount', [10, 20]),
    ])
    const match = matchGoal({ profile: taxSheet, utterance: 'sum column Tax' })
    expect(match.status).toBe('matched')
    expect(match.slots.amountColumn).toBe('C')
  })

  it('asks which money column when two amount roles exist', () => {
    const match = matchGoal({
      profile: profile([
        col('Revenue', 'B', 'amount', [100]),
        col('Profit', 'C', 'amount', [40]),
      ]),
      utterance: 'total spending',
    })
    expect(match.status).toBe('ambiguous')
    expect(match.chips).toEqual(['sum column B', 'sum column C'])
  })

  it('matches by category and by month from utterance', () => {
    expect(matchGoal({ profile: expenses, utterance: 'break down spending by category' }).goal?.id).toBe('by_category')
    expect(matchGoal({ profile: expenses, utterance: 'show me totals by month' }).goal?.id).toBe('by_month')
    expect(matchGoal({ profile: expenses, utterance: 'show me totals by month' }).output).toBe('chart')
  })

  it('resolves an amount column from an ambiguous follow-up chip', () => {
    expect(matchGoal({
      profile: profile([
        col('Revenue', 'B', 'amount', [100]),
        col('Profit', 'C', 'amount', [40]),
        col('Category', 'A', 'category'),
      ]),
      utterance: 'spending by category using Revenue',
    }).slots.amountColumn).toBe('B')
  })

  it('does not steal template or sort commands', () => {
    expect(matchGoal({ profile: expenses, utterance: 'create a monthly budget' }).status).toBe('unmatched')
    expect(matchGoal({ profile: expenses, utterance: 'sort by amount' }).status).toBe('unmatched')
  })

  it('uses summary output for questions', () => {
    const match = matchGoal({ profile: expenses, utterance: 'what is my total spending?' })
    expect(match.status).toBe('matched')
    expect(match.output).toBe('summary')
  })
})

describe('executeGoal', () => {
  it('dispatches total formula to apply_formula', () => {
    const match = matchGoal({ profile: expenses, utterance: 'sum column C' })
    const result = executeGoal(match)
    expect(result.actions[0]).toMatchObject({
      tool: 'apply_formula',
      params: { cell: 'C', formula: '=SUM' },
    })
    expect(result.explain).toContain('Goal: Total')
  })

  it('dispatches by-category to create_chart', () => {
    const match = matchGoal({ profile: expenses, utterance: 'spending by category' })
    const result = executeGoal(match, expenses)
    expect(result.actions[0].tool).toBe('create_chart')
    expect(result.actions[0].params).toMatchObject({
      type: 'pie',
      dataRange: 'B2:B5',
      series: [{ label: 'Amount', dataRange: 'C2:C5' }],
    })
  })

  it('does not write SUM for a monthly formula request', () => {
    const match = matchGoal({ profile: expenses, utterance: 'monthly spending formula' })
    const result = executeGoal(match, expenses)
    expect(result.actions).toEqual([])
    expect(result.message).toMatch(/chart/i)
  })

  it('summarizes the actual column total', () => {
    const withSum = profile([
      { ...col('Amount', 'C', 'amount', [1500, 400]), sumVal: 1900 },
    ])
    const match = matchGoal({ profile: withSum, utterance: 'what is my total spending?' })
    const result = executeGoal(match, withSum)
    expect(result.actions).toEqual([])
    expect(result.message).toContain('1,900')
  })
})

describe('listSuggestedGoals', () => {
  it('lists only goals whose roles are unique on the sheet', () => {
    const titles = listSuggestedGoals(expenses).map((item) => item.goal?.id)
    expect(titles).toEqual(['total', 'by_category', 'by_month'])
  })
})
