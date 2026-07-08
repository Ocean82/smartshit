import { describe, expect, it } from 'vitest'
import { analyzeBudget, savingsRecommendation } from './budget'
import type { SheetProfile } from '@/ai/types'
import type { SheetInsights } from '@/ai/sheetInsights'

const profile: SheetProfile = {
  name: 'Budget',
  rowCount: 20,
  colCount: 4,
  columns: [],
  detectedPurpose: 'budget',
  hasHeaders: true,
  hasTotalsRow: true,
}

const insights: SheetInsights = {
  headerRow: 0,
  headers: ['Category', 'Budget', 'Actual'],
  columnStats: [],
  topExpenses: [
    { label: 'Housing', amount: 1500 },
    { label: 'Food', amount: 450 },
  ],
  totalIncome: 5000,
  totalExpenses: 3800,
  netCashflow: 1200,
}

describe('budget skill', () => {
  it('identifies top spending categories', () => {
    const analysis = analyzeBudget(profile, insights)
    expect(analysis.overspendingCategories.length).toBeGreaterThan(0)
    expect(analysis.summary).toContain('Housing')
  })

  it('recommends savings for monthly income', () => {
    const result = savingsRecommendation(5000, insights)
    expect(result.success).toBe(true)
    expect(result.message).toContain('5,000')
  })

  it('adds assumptions when income is missing', () => {
    const noIncomeInsights: SheetInsights = {
      ...insights,
      totalIncome: undefined,
      netCashflow: undefined,
    }
    const analysis = analyzeBudget(profile, noIncomeInsights)
    expect(analysis.summary).toContain('Assumptions')
  })
})
