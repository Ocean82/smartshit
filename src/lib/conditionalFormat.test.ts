import { describe, expect, it } from 'vitest'
import { matchesConditionalFormat, findConditionalFormatTargets } from './conditionalFormat'

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
