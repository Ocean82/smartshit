import { describe, expect, it } from 'vitest'
import { validateCell } from './validation'
import type { DataValidation } from '@/types'

describe('validateCell', () => {
  describe('number validation', () => {
    it('passes when no validation', () => {
      expect(validateCell(42, null)).toEqual({ valid: true })
    })

    it('passes empty values', () => {
      const v: DataValidation = { type: 'number', min: 0, max: 100 }
      expect(validateCell(null, v)).toEqual({ valid: true })
    })

    it('rejects non-numeric', () => {
      const v: DataValidation = { type: 'number', min: 0 }
      expect(validateCell('hello', v).valid).toBe(false)
    })

    it('validates between (default criteria)', () => {
      const v: DataValidation = { type: 'number', min: 0, max: 100 }
      expect(validateCell(50, v).valid).toBe(true)
      expect(validateCell(-1, v).valid).toBe(false)
      expect(validateCell(101, v).valid).toBe(false)
    })

    it('validates greaterThan', () => {
      const v: DataValidation = { type: 'number', criteria: 'greaterThan', min: 0 }
      expect(validateCell(1, v).valid).toBe(true)
      expect(validateCell(0, v).valid).toBe(false)
      expect(validateCell(-1, v).valid).toBe(false)
    })

    it('validates lessThan', () => {
      const v: DataValidation = { type: 'number', criteria: 'lessThan', max: 100 }
      expect(validateCell(99, v).valid).toBe(true)
      expect(validateCell(100, v).valid).toBe(false)
    })

    it('validates greaterThanOrEqual', () => {
      const v: DataValidation = { type: 'number', criteria: 'greaterThanOrEqual', min: 0 }
      expect(validateCell(0, v).valid).toBe(true)
      expect(validateCell(-0.01, v).valid).toBe(false)
    })

    it('validates lessThanOrEqual', () => {
      const v: DataValidation = { type: 'number', criteria: 'lessThanOrEqual', max: 100 }
      expect(validateCell(100, v).valid).toBe(true)
      expect(validateCell(100.01, v).valid).toBe(false)
    })

    it('validates equalTo', () => {
      const v: DataValidation = { type: 'number', criteria: 'equalTo', min: 42 }
      expect(validateCell(42, v).valid).toBe(true)
      expect(validateCell(43, v).valid).toBe(false)
    })

    it('validates notEqualTo', () => {
      const v: DataValidation = { type: 'number', criteria: 'notEqualTo', min: 0 }
      expect(validateCell(5, v).valid).toBe(true)
      expect(validateCell(0, v).valid).toBe(false)
    })

    it('validates notBetween', () => {
      const v: DataValidation = { type: 'number', criteria: 'notBetween', min: 10, max: 20 }
      expect(validateCell(5, v).valid).toBe(true)
      expect(validateCell(25, v).valid).toBe(true)
      expect(validateCell(15, v).valid).toBe(false)
    })
  })

  describe('list validation', () => {
    it('passes valid list value', () => {
      const v: DataValidation = { type: 'list', values: ['Yes', 'No', 'Maybe'] }
      expect(validateCell('Yes', v).valid).toBe(true)
    })

    it('rejects invalid list value', () => {
      const v: DataValidation = { type: 'list', values: ['Yes', 'No', 'Maybe'] }
      expect(validateCell('Perhaps', v).valid).toBe(false)
    })

    it('passes empty value', () => {
      const v: DataValidation = { type: 'list', values: ['Yes', 'No'] }
      expect(validateCell(null, v).valid).toBe(true)
    })
  })

  describe('text validation', () => {
    it('validates length min', () => {
      const v: DataValidation = { type: 'text', criteria: 'length', min: 3 }
      expect(validateCell('ab', v).valid).toBe(false)
      expect(validateCell('abc', v).valid).toBe(true)
    })

    it('validates length max', () => {
      const v: DataValidation = { type: 'text', criteria: 'length', max: 5 }
      expect(validateCell('hello', v).valid).toBe(true)
      expect(validateCell('toolong', v).valid).toBe(false)
    })

    it('validates contains', () => {
      const v: DataValidation = { type: 'text', criteria: 'contains', containsText: 'foo' }
      expect(validateCell('foobar', v).valid).toBe(true)
      expect(validateCell('barBaz', v).valid).toBe(false)
    })

    it('validates notContains', () => {
      const v: DataValidation = { type: 'text', criteria: 'notContains', containsText: 'spam' }
      expect(validateCell('hello world', v).valid).toBe(true)
      expect(validateCell('this is spam', v).valid).toBe(false)
    })

    it('validates startsWith', () => {
      const v: DataValidation = { type: 'text', criteria: 'startsWith', containsText: 'http' }
      expect(validateCell('https://example.com', v).valid).toBe(true)
      expect(validateCell('ftp://server', v).valid).toBe(false)
    })

    it('validates endsWith', () => {
      const v: DataValidation = { type: 'text', criteria: 'endsWith', containsText: '.com' }
      expect(validateCell('example.com', v).valid).toBe(true)
      expect(validateCell('example.org', v).valid).toBe(false)
    })
  })

  describe('date validation', () => {
    it('rejects invalid date', () => {
      const v: DataValidation = { type: 'date' }
      expect(validateCell('not-a-date', v).valid).toBe(false)
    })

    it('passes valid date with no criteria', () => {
      const v: DataValidation = { type: 'date' }
      expect(validateCell('2026-07-11', v).valid).toBe(true)
    })

    it('validates after', () => {
      const v: DataValidation = { type: 'date', criteria: 'after', dateMin: '2026-01-01' }
      expect(validateCell('2026-06-15', v).valid).toBe(true)
      expect(validateCell('2025-12-31', v).valid).toBe(false)
    })

    it('validates before', () => {
      const v: DataValidation = { type: 'date', criteria: 'before', dateMax: '2026-12-31' }
      expect(validateCell('2026-06-15', v).valid).toBe(true)
      expect(validateCell('2027-01-01', v).valid).toBe(false)
    })

    it('validates between dates', () => {
      const v: DataValidation = { type: 'date', criteria: 'between', dateMin: '2026-01-01', dateMax: '2026-12-31' }
      expect(validateCell('2026-06-15', v).valid).toBe(true)
      expect(validateCell('2025-06-15', v).valid).toBe(false)
      expect(validateCell('2027-06-15', v).valid).toBe(false)
    })
  })

  describe('custom/formula validation (safe eval)', () => {
    it('validates simple comparison: value > 0', () => {
      const v: DataValidation = { type: 'custom', criteria: 'value > 0' }
      expect(validateCell(5, v).valid).toBe(true)
      expect(validateCell(0, v).valid).toBe(false)
      expect(validateCell(-1, v).valid).toBe(false)
    })

    it('validates value >= 100', () => {
      const v: DataValidation = { type: 'custom', criteria: 'value >= 100' }
      expect(validateCell(100, v).valid).toBe(true)
      expect(validateCell(99, v).valid).toBe(false)
    })

    it('validates value !== 0', () => {
      const v: DataValidation = { type: 'custom', criteria: 'value !== 0' }
      expect(validateCell(5, v).valid).toBe(true)
      expect(validateCell(0, v).valid).toBe(false)
    })

    it('validates compound: value >= 10 && value <= 100', () => {
      const v: DataValidation = { type: 'custom', criteria: 'value >= 10 && value <= 100' }
      expect(validateCell(50, v).valid).toBe(true)
      expect(validateCell(5, v).valid).toBe(false)
      expect(validateCell(101, v).valid).toBe(false)
    })

    it('validates value.length > 3', () => {
      const v: DataValidation = { type: 'custom', criteria: 'value.length > 3' }
      expect(validateCell('hello', v).valid).toBe(true)
      expect(validateCell('hi', v).valid).toBe(false)
    })

    it('passes when expression cannot be parsed (safe fallback)', () => {
      const v: DataValidation = { type: 'custom', criteria: 'some.complex.expression()' }
      expect(validateCell(42, v).valid).toBe(true)
    })

    it('passes empty values', () => {
      const v: DataValidation = { type: 'custom', criteria: 'value > 0' }
      expect(validateCell(null, v).valid).toBe(true)
    })
  })
})
