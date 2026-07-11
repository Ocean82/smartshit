import { describe, expect, it } from 'vitest'
import { formatCellValue, getBorderCSS } from './formatUtils'

describe('formatCellValue', () => {
  it('formats currency', () => {
    expect(formatCellValue(1234.5, 'currency')).toBe('$1,234.50')
  })

  it('formats percent', () => {
    expect(formatCellValue(12.35, 'percent')).toBe('12.35%')
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
