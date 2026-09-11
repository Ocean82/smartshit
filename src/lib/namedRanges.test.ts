import { describe, expect, it } from 'vitest'
import {
  expandNamedRangesInFormula,
  isValidNamedRangeName,
  normalizeRangeText,
  selectionToAbsRange,
} from './namedRanges'

describe('isValidNamedRangeName', () => {
  it('accepts excel-like identifiers', () => {
    expect(isValidNamedRangeName('Sales')).toBe(true)
    expect(isValidNamedRangeName('_tax')).toBe(true)
    expect(isValidNamedRangeName('Q1.Revenue')).toBe(true)
  })

  it('rejects cell refs and reserved', () => {
    expect(isValidNamedRangeName('A1')).toBe(false)
    expect(isValidNamedRangeName('TRUE')).toBe(false)
    expect(isValidNamedRangeName('Sales Data')).toBe(false)
  })
})

describe('normalizeRangeText / selectionToAbsRange', () => {
  it('normalizes ranges', () => {
    expect(normalizeRangeText('b2:b10')).toBe('$B$2:$B$10')
    expect(normalizeRangeText('$B$2')).toBe('$B$2')
  })

  it('builds from selection', () => {
    expect(selectionToAbsRange({ startRow: 1, startCol: 1, endRow: 9, endCol: 1 })).toBe('$B$2:$B$10')
  })
})

describe('expandNamedRangesInFormula', () => {
  const sheets = [{ id: 's1', name: 'Sheet 1' }]
  const names = [{ name: 'Sales', sheetId: 's1', range: '$B$2:$B$3' }]

  it('expands names inside functions', () => {
    expect(expandNamedRangesInFormula('=SUM(Sales)', names, sheets, 's1'))
      .toBe('=SUM(B2:B3)')
    expect(expandNamedRangesInFormula('=SUM(Sales)', names, sheets, 'other'))
      .toBe("=SUM('Sheet 1'!$B$2:$B$3)")
  })

  it('leaves quoted strings alone', () => {
    expect(expandNamedRangesInFormula('="Sales"', names, sheets)).toBe('="Sales"')
  })
})
