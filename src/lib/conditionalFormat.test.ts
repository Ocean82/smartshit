import { describe, expect, it } from 'vitest'
import {
  matchesConditionalFormat,
  findConditionalFormatTargets,
  conditionToRule,
  ruleMatchesComputed,
  resolveCellFormat,
} from './conditionalFormat'

describe('matchesConditionalFormat', () => {
  it('matches negative and positive', () => {
    expect(matchesConditionalFormat(-5, 'negative')).toBe(true)
    expect(matchesConditionalFormat(5, 'positive')).toBe(true)
    expect(matchesConditionalFormat(0, 'negative')).toBe(false)
  })

  it('matches gt/lt/eq thresholds', () => {
    expect(matchesConditionalFormat(10, 'gt', 5)).toBe(true)
    expect(matchesConditionalFormat(3, 'lt', 5)).toBe(true)
    expect(matchesConditionalFormat(5, 'eq', 5)).toBe(true)
  })
})

describe('conditionToRule / ruleMatchesComputed', () => {
  it('maps negative to lessThan 0', () => {
    const rule = conditionToRule('negative', '#fee')
    expect(rule.type).toBe('lessThan')
    expect(rule.value).toBe(0)
    expect(ruleMatchesComputed(rule, '-3')).toBe(true)
    expect(ruleMatchesComputed(rule, '3')).toBe(false)
  })

  it('maps gt threshold', () => {
    const rule = conditionToRule('gt', '#0f0', 100)
    expect(rule.type).toBe('greaterThan')
    expect(ruleMatchesComputed(rule, '150')).toBe(true)
    expect(ruleMatchesComputed(rule, '50')).toBe(false)
  })
})

describe('resolveCellFormat', () => {
  it('merges matching rule style without mutating base when no match', () => {
    const format = {
      bold: true,
      conditionalRules: [conditionToRule('negative', '#FEE2E2')],
    }
    expect(resolveCellFormat(format, '10')?.bgColor).toBeUndefined()
    expect(resolveCellFormat(format, '10')?.bold).toBe(true)
    expect(resolveCellFormat(format, '-1')?.bgColor).toBe('#FEE2E2')
    expect(resolveCellFormat(format, '-1')?.bold).toBe(true)
  })
})

describe('findConditionalFormatTargets', () => {
  it('returns matching cell ids in column', () => {
    const values: Record<string, string> = {
      B1: 'Amount',
      B2: '-10',
      B3: '20',
      B4: '-3',
    }
    const targets = findConditionalFormatTargets(
      1,
      'negative',
      0,
      (row, col) => values[`${String.fromCharCode(65 + col)}${row + 1}`] ?? '',
      Object.keys(values),
      (cellId) => ({
        row: parseInt(cellId.slice(1), 10) - 1,
        col: cellId.charCodeAt(0) - 65,
      }),
    )
    expect(targets.sort()).toEqual(['B2', 'B4'])
  })
})
