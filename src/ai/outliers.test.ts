import { describe, expect, it } from 'vitest'
import { detectOutliers, isOutlierFollowUp } from '@/ai/outliers'
import { explainOutliers, formatInsights } from '@/ai/responseBuilder'
import type { SheetInsights } from '@/ai/sheetInsights'
import { classifyMode } from '@/ai/mode'

describe('detectOutliers', () => {
  it('includes mean, std, and z-score for flagged values', () => {
    // Many similar values + one extreme so population std still flags it at 2.5σ
    const values = Array.from({ length: 30 }, (_, i) => ({
      row: i + 2,
      value: 100 + ((i % 5) - 2),
    }))
    values.push({ row: 99, value: 10_000 })

    const outliers = detectOutliers(values, 'Amount', 'B')
    expect(outliers.length).toBeGreaterThan(0)
    const big = outliers.find((o) => o.row === 99)
    expect(big).toBeTruthy()
    expect(big!.direction).toBe('high')
    expect(big!.cellRef).toBe('B99')
    expect(big!.columnLetter).toBe('B')
    expect(big!.zScore).toBeGreaterThan(2.5)
    expect(big!.mean).toBeGreaterThan(0)
    expect(big!.std).toBeGreaterThan(0)
  })
})

describe('isOutlierFollowUp', () => {
  it('matches natural follow-ups about unusual values', () => {
    expect(isOutlierFollowUp('what makes those values unusual')).toBe(true)
    expect(isOutlierFollowUp('why are these unusual')).toBe(true)
    expect(isOutlierFollowUp('why are these outliers')).toBe(true)
  })

  it('does not match unrelated questions', () => {
    expect(isOutlierFollowUp('build a monthly budget')).toBe(false)
    expect(isOutlierFollowUp('hello')).toBe(false)
  })
})

describe('explainOutliers / formatInsights', () => {
  const insights: SheetInsights = {
    headerRow: 0,
    headers: ['Amount'],
    columnStats: [],
    outliers: [{
      column: 'Amount',
      columnLetter: 'B',
      cellRef: 'B6',
      row: 6,
      value: 1000,
      mean: 281,
      std: 360,
      zScore: 2.0,
      direction: 'high',
    }],
  }

  it('explains the statistical rule in plain English', () => {
    const text = explainOutliers(insights.outliers!)
    expect(text).toContain('standard deviations')
    expect(text).toContain('B6')
    expect(text).toContain('column')
  })

  it('includes reason text in sheet insights', () => {
    const text = formatInsights(insights)
    expect(text).toContain('Unusual values')
    expect(text).toContain('B6')
    expect(text).toContain('σ')
  })
})

describe('classifyMode for unusual follow-ups', () => {
  it('treats unusual-value questions as explain', () => {
    expect(classifyMode('what makes those values unusual')).toBe('explain')
    expect(classifyMode('why are these unusual')).toBe('explain')
  })
})
