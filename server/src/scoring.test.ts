import { describe, it, expect } from 'vitest'
import { score, scoreByPercentile, scoreByZScore, scoreByCompleteness, scoreByLength } from './scoring.js'

describe('scoreByPercentile', () => {
  it('scores median value at 50', () => {
    const result = scoreByPercentile(50, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(result.score).toBeCloseTo(45, 0) // 4 below + 0.5*1 equal = 4.5/10 = 45%
  })

  it('scores minimum at 5', () => {
    const result = scoreByPercentile(10, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(result.score).toBe(5) // 0 below + 0.5*1 = 0.5/10 = 5%
  })

  it('scores maximum at 95', () => {
    const result = scoreByPercentile(100, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(result.score).toBe(95) // 9 below + 0.5*1 = 9.5/10 = 95%
  })

  it('scores value above all at 100', () => {
    const result = scoreByPercentile(200, [10, 20, 30, 40, 50])
    expect(result.score).toBe(100)
  })

  it('scores value below all at 0', () => {
    const result = scoreByPercentile(1, [10, 20, 30, 40, 50])
    expect(result.score).toBe(0)
  })

  it('returns 50 for empty distribution', () => {
    const result = scoreByPercentile(42, [])
    expect(result.score).toBe(50)
  })

  it('is deterministic', () => {
    const r1 = scoreByPercentile(75, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    const r2 = scoreByPercentile(75, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(r1.score).toBe(r2.score)
  })
})

describe('scoreByZScore', () => {
  it('scores mean value at 50', () => {
    const result = scoreByZScore(50, 50, 10)
    expect(result.score).toBe(50)
  })

  it('scores +2 sigma high', () => {
    const result = scoreByZScore(70, 50, 10)
    expect(result.score).toBeGreaterThan(90)
  })

  it('scores -2 sigma low', () => {
    const result = scoreByZScore(30, 50, 10)
    expect(result.score).toBeLessThan(10)
  })

  it('handles zero stddev', () => {
    const result = scoreByZScore(50, 50, 0)
    expect(result.score).toBe(50)
  })

  it('handles value above mean with zero stddev', () => {
    const result = scoreByZScore(60, 50, 0)
    expect(result.score).toBe(100)
  })
})

describe('scoreByCompleteness', () => {
  it('scores empty string at 0', () => {
    const result = scoreByCompleteness('')
    expect(result.score).toBe(0)
  })

  it('scores rich text high', () => {
    const result = scoreByCompleteness('The quarterly revenue grew by 15% to $2.3M, driven by SaaS expansion.')
    expect(result.score).toBeGreaterThan(75)
  })

  it('scores short text lower', () => {
    const result = scoreByCompleteness('ok')
    expect(result.score).toBeLessThan(50)
  })
})

describe('scoreByLength', () => {
  it('scores proportional to max length', () => {
    const result = scoreByLength('hello world', 100)
    expect(result.score).toBe(11) // 11 chars / 100 = 11%
  })

  it('caps at 100', () => {
    const result = scoreByLength('a'.repeat(1000), 500)
    expect(result.score).toBe(100)
  })
})

describe('score (auto-select)', () => {
  it('uses percentile when distribution provided', () => {
    const result = score(75, { distribution: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] })
    expect(result.method).toBe('percentile')
    expect(result.score).toBeGreaterThan(60)
  })

  it('uses z-score when mean/stddev provided', () => {
    const result = score(70, { mean: 50, stddev: 10 })
    expect(result.method).toBe('z_score')
    expect(result.score).toBeGreaterThan(90)
  })

  it('uses completeness for text without context', () => {
    const result = score('Great product, highly recommend! 5 stars.', { criteria: 'quality' })
    expect(result.method).toBe('completeness')
  })

  it('uses length scoring when criteria is "length"', () => {
    const result = score('short', { criteria: 'length' })
    expect(result.method).toBe('length')
  })

  it('clamps numeric value without context to 0-100', () => {
    const result = score(75)
    expect(result.score).toBe(75)
    expect(result.method).toBe('rubric')
  })

  it('clamps values above 100', () => {
    const result = score(150)
    expect(result.score).toBe(100)
  })

  it('clamps values below 0', () => {
    const result = score(-20)
    expect(result.score).toBe(0)
  })
})
