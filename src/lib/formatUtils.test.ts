import { describe, expect, it } from 'vitest'
import { formatCellValue, getBorderCSS } from './formatUtils'

describe('formatCellValue', () => {
  it('formats currency', () => {
    expect(formatCellValue(1234.5, 'currency')).toBe('$1,234.50')
  })

  it('formats percent from percent points (>1)', () => {
    expect(formatCellValue(12.35, 'percent')).toBe('12.35%')
  })

  it('formats percent from ratio (|n|<=1)', () => {
    expect(formatCellValue(0.1235, 'percent')).toBe('12.35%')
    expect(formatCellValue(1, 'percent')).toBe('100.00%')
  })

  it('formats date from ISO string', () => {
    expect(formatCellValue('2026-07-11', 'date')).toBe('7/11/2026')
  })

  it('returns raw string when date parse fails', () => {
    expect(formatCellValue('not-a-date', 'date')).toBe('not-a-date')
  })

  it('returns empty for null', () => {
    expect(formatCellValue(null)).toBe('')
  })
})

describe('getBorderCSS', () => {
  it('maps active border sides', () => {
    expect(getBorderCSS({
      top: '1px solid #000',
      left: '2px solid #f00',
    })).toEqual({
      borderTop: '1px solid #000',
      borderLeft: '2px solid #f00',
    })
  })

  it('ignores empty-string border sides', () => {
    expect(getBorderCSS({
      top: '',
      right: '1px solid #000',
      bottom: '   ',
    })).toEqual({
      borderRight: '1px solid #000',
    })
  })
})
