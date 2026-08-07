import { describe, it, expect } from 'vitest'
import { forecast, forecastLinear, forecastMovingAverage, forecastSeasonalNaive } from './forecast.js'

describe('forecastLinear', () => {
  it('predicts next value in a perfect linear sequence', () => {
    const result = forecastLinear([1, 2, 3, 4, 5])
    expect(result.value).toBe(6)
    expect(result.method).toBe('linear')
    expect(result.confidence).toBeCloseTo(1.0, 2)
  })

  it('predicts multiple periods ahead', () => {
    const result = forecastLinear([1, 2, 3, 4, 5], 3)
    expect(result.value).toBe(8)
  })

  it('handles a single value', () => {
    const result = forecastLinear([42])
    expect(result.value).toBe(42)
    expect(result.confidence).toBe(0)
  })

  it('handles empty array', () => {
    const result = forecastLinear([])
    expect(result.value).toBe(0)
    expect(result.confidence).toBe(0)
  })

  it('handles noisy linear data with lower confidence', () => {
    const result = forecastLinear([1, 3, 2, 4, 3, 5])
    expect(result.confidence).toBeLessThan(1.0)
    expect(result.confidence).toBeGreaterThan(0.3)
  })

  it('handles constant values', () => {
    const result = forecastLinear([5, 5, 5, 5])
    expect(result.value).toBe(5)
    expect(result.confidence).toBe(1) // R² = 1 for constant (no residuals)
  })

  it('is deterministic — same input always gives same output', () => {
    const values = [10, 20, 15, 25, 30]
    const r1 = forecastLinear(values)
    const r2 = forecastLinear(values)
    expect(r1.value).toBe(r2.value)
    expect(r1.confidence).toBe(r2.confidence)
  })

  it('includes diagnostics with slope and intercept', () => {
    const result = forecastLinear([2, 4, 6, 8])
    expect(result.diagnostics?.slope).toBeCloseTo(2, 2)
    expect(result.diagnostics?.intercept).toBeCloseTo(2, 2)
  })
})

describe('forecastMovingAverage', () => {
  it('returns average of last N values', () => {
    const result = forecastMovingAverage([10, 20, 30, 40, 50], 3)
    // Average of [30, 40, 50] = 40
    expect(result.value).toBe(40)
    expect(result.method).toBe('moving_average')
  })

  it('auto-selects window size', () => {
    const result = forecastMovingAverage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(result.diagnostics?.window).toBe(5)
  })

  it('handles single value', () => {
    const result = forecastMovingAverage([42])
    expect(result.value).toBe(42)
  })

  it('handles empty array', () => {
    const result = forecastMovingAverage([])
    expect(result.value).toBe(0)
  })

  it('has higher confidence for stable values', () => {
    const stable = forecastMovingAverage([50, 50, 50, 50, 50])
    const volatile = forecastMovingAverage([10, 90, 20, 80, 30])
    expect(stable.confidence).toBeGreaterThan(volatile.confidence)
  })
})

describe('forecastSeasonalNaive', () => {
  it('detects quarterly seasonality', () => {
    // Clear quarterly pattern: 10, 20, 30, 40 repeating
    const values = [10, 20, 30, 40, 10, 20, 30, 40, 10, 20, 30, 40]
    const result = forecastSeasonalNaive(values)
    // Should predict next value = value from one season ago
    expect(result.method).toBe('seasonal_naive')
    expect(result.confidence).toBeGreaterThan(0.3)
  })

  it('uses explicit season length', () => {
    const values = [1, 2, 3, 1, 2, 3, 1, 2, 3]
    const result = forecastSeasonalNaive(values, 3)
    // Next after [1,2,3,1,2,3,1,2,3] with period 3: values[9-3] = values[6] = 1
    expect(result.value).toBe(1)
    expect(result.diagnostics?.seasonLength).toBe(3)
  })

  it('returns last value for too-short data', () => {
    const result = forecastSeasonalNaive([5, 10])
    expect(result.value).toBe(10)
    expect(result.confidence).toBe(0)
  })
})

describe('forecast (auto-select)', () => {
  it('selects linear for strong trend', () => {
    const result = forecast([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.method).toBe('linear')
    expect(result.value).toBe(9)
  })

  it('selects moving average for noisy data without trend', () => {
    // Truly flat noisy data — no linear trend (R² < 0.7), no seasonality
    const result = forecast([42, 38, 45, 39, 41, 44, 37, 43, 40, 42, 38, 41])
    expect(['moving_average', 'seasonal_naive']).toContain(result.method)
    // Key assertion: it does NOT pick linear since there's no trend
    expect(result.method).not.toBe('linear')
  })

  it('respects forced method', () => {
    const result = forecast([1, 2, 3, 4, 5], { method: 'moving_average' })
    expect(result.method).toBe('moving_average')
  })

  it('respects periods option', () => {
    const result = forecast([1, 2, 3, 4, 5], { periods: 2 })
    expect(result.value).toBe(7)
  })

  it('handles large datasets efficiently', () => {
    const values = Array.from({ length: 1000 }, (_, i) => i * 2 + Math.random() * 0.01)
    const start = performance.now()
    const result = forecast(values)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50) // Must complete in <50ms
    expect(result.method).toBe('linear')
  })
})
