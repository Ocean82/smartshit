/**
 * Unit tests for Fallback Threshold Configuration
 *
 * Validates threshold validation logic, default values, boundary conditions,
 * and rejection of invalid inputs.
 *
 * Validates: Requirements 8.3
 */

import { describe, it, expect } from 'vitest'
import {
  validateFallbackThreshold,
  createValidatedConfig,
  DEFAULT_FALLBACK_THRESHOLD,
} from '../thresholdConfig'

// ─── Default Value ──────────────────────────────────────────────────────────

describe('DEFAULT_FALLBACK_THRESHOLD', () => {
  it('is 0.6', () => {
    expect(DEFAULT_FALLBACK_THRESHOLD).toBe(0.6)
  })
})

// ─── validateFallbackThreshold ──────────────────────────────────────────────

describe('validateFallbackThreshold', () => {
  describe('default value when unconfigured', () => {
    it('returns 0.6 when value is undefined', () => {
      expect(validateFallbackThreshold(undefined)).toBe(0.6)
    })

    it('returns 0.6 when value is null', () => {
      expect(validateFallbackThreshold(null)).toBe(0.6)
    })

    it('returns 0.6 when called with no arguments', () => {
      expect(validateFallbackThreshold()).toBe(0.6)
    })
  })

  describe('valid boundary values', () => {
    it('accepts 0.0 (lower bound)', () => {
      expect(validateFallbackThreshold(0.0)).toBe(0.0)
    })

    it('accepts 0.5 (midpoint)', () => {
      expect(validateFallbackThreshold(0.5)).toBe(0.5)
    })

    it('accepts 1.0 (upper bound)', () => {
      expect(validateFallbackThreshold(1.0)).toBe(1.0)
    })
  })

  describe('valid fractional values', () => {
    it('accepts 0.1', () => {
      expect(validateFallbackThreshold(0.1)).toBe(0.1)
    })

    it('accepts 0.99', () => {
      expect(validateFallbackThreshold(0.99)).toBe(0.99)
    })

    it('accepts 0.001', () => {
      expect(validateFallbackThreshold(0.001)).toBe(0.001)
    })

    it('accepts 0.75', () => {
      expect(validateFallbackThreshold(0.75)).toBe(0.75)
    })
  })

  describe('invalid values - negative', () => {
    it('rejects -0.1', () => {
      expect(() => validateFallbackThreshold(-0.1)).toThrow(
        /Invalid fallback threshold.*-0\.1.*\[0\.0, 1\.0\]/
      )
    })

    it('rejects -1', () => {
      expect(() => validateFallbackThreshold(-1)).toThrow(
        /Invalid fallback threshold/
      )
    })

    it('rejects -100', () => {
      expect(() => validateFallbackThreshold(-100)).toThrow(
        /Invalid fallback threshold/
      )
    })
  })

  describe('invalid values - greater than 1', () => {
    it('rejects 1.01', () => {
      expect(() => validateFallbackThreshold(1.01)).toThrow(
        /Invalid fallback threshold.*1\.01.*\[0\.0, 1\.0\]/
      )
    })

    it('rejects 2', () => {
      expect(() => validateFallbackThreshold(2)).toThrow(
        /Invalid fallback threshold/
      )
    })

    it('rejects 100', () => {
      expect(() => validateFallbackThreshold(100)).toThrow(
        /Invalid fallback threshold/
      )
    })
  })

  describe('invalid values - NaN and Infinity', () => {
    it('rejects NaN', () => {
      expect(() => validateFallbackThreshold(NaN)).toThrow(
        /Invalid fallback threshold.*NaN/
      )
    })

    it('rejects Infinity', () => {
      expect(() => validateFallbackThreshold(Infinity)).toThrow(
        /Invalid fallback threshold.*Infinity.*finite/
      )
    })

    it('rejects -Infinity', () => {
      expect(() => validateFallbackThreshold(-Infinity)).toThrow(
        /Invalid fallback threshold.*-Infinity.*finite/
      )
    })
  })
})

// ─── createValidatedConfig ──────────────────────────────────────────────────

describe('createValidatedConfig', () => {
  it('returns default threshold when called with no arguments', () => {
    const config = createValidatedConfig()
    expect(config.fallbackThreshold).toBe(0.6)
  })

  it('returns default threshold when called with empty object', () => {
    const config = createValidatedConfig({})
    expect(config.fallbackThreshold).toBe(0.6)
  })

  it('returns default threshold when fallbackThreshold is undefined', () => {
    const config = createValidatedConfig({ fallbackThreshold: undefined })
    expect(config.fallbackThreshold).toBe(0.6)
  })

  it('uses provided valid threshold', () => {
    const config = createValidatedConfig({ fallbackThreshold: 0.8 })
    expect(config.fallbackThreshold).toBe(0.8)
  })

  it('accepts boundary value 0.0', () => {
    const config = createValidatedConfig({ fallbackThreshold: 0.0 })
    expect(config.fallbackThreshold).toBe(0.0)
  })

  it('accepts boundary value 1.0', () => {
    const config = createValidatedConfig({ fallbackThreshold: 1.0 })
    expect(config.fallbackThreshold).toBe(1.0)
  })

  it('throws on invalid threshold', () => {
    expect(() => createValidatedConfig({ fallbackThreshold: 1.5 })).toThrow(
      /Invalid fallback threshold/
    )
  })

  it('throws on NaN threshold', () => {
    expect(() => createValidatedConfig({ fallbackThreshold: NaN })).toThrow(
      /Invalid fallback threshold/
    )
  })
})
