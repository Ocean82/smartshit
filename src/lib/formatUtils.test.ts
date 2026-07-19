import { describe, expect, it } from 'vitest'
import { formatCellValue, getBorderCSS, isNegativeRedFormat } from './formatUtils'

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

  // --- New format tests ---

  // Number variants
  it('formats number-int (no decimals)', () => {
    expect(formatCellValue(1234.7, 'number-int')).toBe('1,235')
    expect(formatCellValue(42, 'number-int')).toBe('42')
  })

  it('formats number-neg-red same as number', () => {
    expect(formatCellValue(-1234.5, 'number-neg-red')).toBe('-1,234.50')
    expect(formatCellValue(1234.5, 'number-neg-red')).toBe('1,234.50')
  })

  // Currency variants
  it('formats currency-int (no decimals)', () => {
    expect(formatCellValue(1234.7, 'currency-int')).toBe('$1,235')
  })

  it('formats currency-gbp', () => {
    expect(formatCellValue(1234.56, 'currency-gbp')).toBe('£1,234.56')
  })

  it('formats currency-eur', () => {
    const result = formatCellValue(1234.56, 'currency-eur')
    // de-DE locale uses period as thousands separator and comma for decimal
    expect(result).toContain('1.234,56')
    expect(result).toContain('€')
  })

  it('formats currency-jpy (no decimals)', () => {
    const result = formatCellValue(1234, 'currency-jpy')
    expect(result).toContain('1,234')
    // ja-JP locale uses fullwidth yen sign ￥
    expect(result).toMatch(/[¥￥]/)
  })

  // Accounting
  it('formats accounting positive', () => {
    expect(formatCellValue(1234.56, 'accounting')).toBe('$ 1,234.56')
  })

  it('formats accounting zero', () => {
    expect(formatCellValue(0, 'accounting')).toBe('$ -')
  })

  it('formats accounting negative (standard)', () => {
    expect(formatCellValue(-1234.56, 'accounting')).toBe('$ -1,234.56')
  })

  it('formats accounting-neg (parentheses)', () => {
    expect(formatCellValue(-1234.56, 'accounting-neg')).toBe('$ (1,234.56)')
    expect(formatCellValue(1234.56, 'accounting-neg')).toBe('$ 1,234.56')
  })

  // Date variants
  it('formats date-iso', () => {
    expect(formatCellValue('2026-07-11', 'date-iso')).toBe('2026-07-11')
  })

  it('formats date-long', () => {
    expect(formatCellValue('2026-07-11', 'date-long')).toBe('July 11, 2026')
  })

  it('formats date-short-eu (DD/MM/YYYY)', () => {
    expect(formatCellValue('2026-07-11', 'date-short-eu')).toBe('11/07/2026')
  })

  it('formats date-mmm-yy', () => {
    expect(formatCellValue('2026-07-11', 'date-mmm-yy')).toBe('Jul 26')
  })

  it('formats date-d-mmm', () => {
    expect(formatCellValue('2026-07-11', 'date-d-mmm')).toBe('Jul 11')
  })

  // Time variants
  it('formats time (12-hour)', () => {
    expect(formatCellValue('15:45', 'time')).toBe('3:45 PM')
    expect(formatCellValue('9:30', 'time')).toBe('9:30 AM')
  })

  it('formats time-24', () => {
    expect(formatCellValue('15:45', 'time-24')).toBe('15:45')
  })

  it('formats time-seconds', () => {
    expect(formatCellValue('15:45:30', 'time-seconds')).toBe('3:45:30 PM')
  })

  it('formats datetime from ISO datetime string', () => {
    const result = formatCellValue('2026-07-11T15:45:00', 'datetime')
    expect(result).toContain('7/11/2026')
    expect(result).toContain('3:45 PM')
  })

  // Percentage variants
  it('formats percent-int (no decimals)', () => {
    expect(formatCellValue(0.126, 'percent-int')).toBe('13%')
    expect(formatCellValue(75, 'percent-int')).toBe('75%')
  })

  // Fraction
  it('formats fraction for simple values', () => {
    expect(formatCellValue(0.25, 'fraction')).toBe('1/4')
    expect(formatCellValue(0.5, 'fraction')).toBe('1/2')
    expect(formatCellValue(1.5, 'fraction')).toBe('1 1/2')
    expect(formatCellValue(3, 'fraction')).toBe('3')
  })

  // Scientific
  it('formats scientific notation', () => {
    expect(formatCellValue(1234, 'scientific')).toBe('1.23E+3')
    expect(formatCellValue(0.005, 'scientific')).toBe('5.00E-3')
  })

  // Edge cases
  it('returns string for non-numeric with numeric format', () => {
    expect(formatCellValue('hello', 'currency')).toBe('hello')
    expect(formatCellValue('hello', 'number')).toBe('hello')
    expect(formatCellValue('hello', 'scientific')).toBe('hello')
  })

  it('handles boolean values', () => {
    expect(formatCellValue(true)).toBe('TRUE')
    expect(formatCellValue(false)).toBe('FALSE')
  })

  it('handles unknown format gracefully', () => {
    expect(formatCellValue(42, 'unknown-format')).toBe('42')
  })
})

describe('isNegativeRedFormat', () => {
  it('returns true for negative numbers with number-neg-red', () => {
    expect(isNegativeRedFormat('number-neg-red', -5)).toBe(true)
    expect(isNegativeRedFormat('number-neg-red', -0.01)).toBe(true)
  })

  it('returns false for positive numbers with number-neg-red', () => {
    expect(isNegativeRedFormat('number-neg-red', 5)).toBe(false)
    expect(isNegativeRedFormat('number-neg-red', 0)).toBe(false)
  })

  it('returns false for other formats', () => {
    expect(isNegativeRedFormat('currency', -5)).toBe(false)
    expect(isNegativeRedFormat('number', -5)).toBe(false)
    expect(isNegativeRedFormat(undefined, -5)).toBe(false)
  })

  it('returns false for non-numeric values', () => {
    expect(isNegativeRedFormat('number-neg-red', 'hello')).toBe(false)
    expect(isNegativeRedFormat('number-neg-red', null)).toBe(false)
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
