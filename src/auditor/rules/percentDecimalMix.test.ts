import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

const RULE = 'percent-decimal-mix'
const column = (header: string, values: number[]) => ({
  A1: { value: header },
  ...Object.fromEntries(values.map((v, i) => [`A${i + 2}`, { value: v }])),
})

describe('percent-decimal-mix rule', () => {
  it('flags whole-number percents among fractions under a rate header', () => {
    const found = findingsOf(column('Growth %', [0.05, 0.08, 0.12, 0.1, 8, 0.07]), RULE)
    expect(found).toHaveLength(1)
    expect(found[0].cells.map((c) => c.cellId)).toEqual(['A6'])
  })

  it('flags a fraction among whole-number percents', () => {
    const found = findingsOf(column('Discount rate', [5, 10, 15, 0.2, 8, 12]), RULE)
    expect(found[0].cells.map((c) => c.cellId)).toEqual(['A5'])
  })

  it('needs a rate-like header', () => {
    expect(findingsOf(column('Amount', [0.05, 0.08, 0.12, 0.1, 8, 0.07]), RULE)).toEqual([])
  })

  it('stays quiet when the column is consistent or 1 is the only outlier', () => {
    expect(findingsOf(column('Rate', [0.05, 0.08, 0.12, 0.1, 0.07]), RULE)).toEqual([])
    expect(findingsOf(column('Rate', [0.05, 0.08, 1, 0.1, 0.07]), RULE)).toEqual([])
  })

  it('stays quiet when the two kinds are evenly mixed', () => {
    expect(findingsOf(column('Rate', [0.05, 5, 0.08, 8, 0.1, 10]), RULE)).toEqual([])
  })

  it('needs enough values to judge', () => {
    expect(findingsOf(column('Rate', [0.05, 0.08, 8]), RULE)).toEqual([])
    expect(findingsOf({ ...fill('B', 2, 7, (r) => r), B1: { value: 'Rate' } }, RULE)).toEqual([])
  })
})
