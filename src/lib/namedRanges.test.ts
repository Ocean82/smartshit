import { describe, expect, it } from 'vitest'
import {
  expandNamedRangesInFormula,
  isValidNamedRangeName,
  normalizeRangeText,
  selectionToAbsRange,
  shiftA1Range,
  shiftNamedRangesOnSheet,
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

describe('shiftNamedRangesOnSheet / shiftA1Range', () => {
  it('shifts A1 ranges on insert', () => {
    expect(shiftA1Range('A1:B2', 'row', 0, 'insert')).toBe('A1:B3')
    expect(shiftA1Range('D5:E6', 'row', 0, 'insert')).toBe('D6:E7')
  })

  it('remaps names on the target sheet only', () => {
    const names = [
      { name: 'Sales', sheetId: 's1', range: '$A$1:$B$2' },
      { name: 'Other', sheetId: 's2', range: '$A$1:$B$2' },
    ]
    const next = shiftNamedRangesOnSheet(names, 's1', 'row', 0, 'insert')
    expect(next).toEqual([
      { name: 'Sales', sheetId: 's1', range: '$A$1:$B$3' },
      { name: 'Other', sheetId: 's2', range: '$A$1:$B$2' },
    ])
  })

  it('drops a name whose only row was deleted', () => {
    const names = [{ name: 'One', sheetId: 's1', range: '$A$1' }]
    expect(shiftNamedRangesOnSheet(names, 's1', 'row', 0, 'delete')).toEqual([])
  })
})
