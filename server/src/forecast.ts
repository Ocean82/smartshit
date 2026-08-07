/**
 * ForecastEngine — Deterministic prediction for AI.PREDICT / AI.SCORE.
 *
 * Replaces the LLM-based number hallucination with proper statistical methods:
 * - Linear regression (OLS)
 * - Moving average
 * - Seasonal naive (autocorrelation-based period detection)
 *
 * All functions are pure, stateless, and deterministic.
 * Same input always produces the same output. No network calls.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ForecastResult {
  /** The predicted value */
  value: number
  /** Which method was used */
  method: 'linear' | 'moving_average' | 'seasonal_naive'
  /** Confidence metric (R² for linear, 1 - CV for MA, correlation for seasonal) */
  confidence: number
  /** Additional diagnostics */
  diagnostics?: {
    slope?: number
    intercept?: number
    rSquared?: number
    seasonLength?: number
    window?: number
  }
}

export interface ForecastOptions {
  /** Number of periods ahead to predict (default: 1) */
  periods?: number
  /** Force a specific method instead of auto-selecting */
  method?: 'linear' | 'moving_average' | 'seasonal_naive'
  /** Window size for moving average (default: auto) */
  window?: number
  /** Season length for seasonal naive (default: auto-detect) */
  seasonLength?: number
}

// ─── Linear Regression (OLS) ─────────────────────────────────────────────────

/**
 * Ordinary least squares linear regression.
 * Predicts the value at position n + periods.
 */
export function forecastLinear(values: number[], periods = 1): ForecastResult {
  const n = values.length
  if (n === 0) {
    return { value: 0, method: 'linear', confidence: 0 }
  }
  if (n === 1) {
    return { value: values[0], method: 'linear', confidence: 0 }
  }

  // Compute OLS: y = slope * x + intercept
  // x values are 0, 1, 2, ..., n-1
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }

  const meanX = sumX / n
  const meanY = sumY / n
  const denominator = sumX2 - n * meanX * meanX

  // If all x values are the same (shouldn't happen with 0..n-1, but guard)
  if (Math.abs(denominator) < 1e-10) {
    return { value: meanY, method: 'linear', confidence: 0 }
  }

  const slope = (sumXY - n * meanX * meanY) / denominator
  const intercept = meanY - slope * meanX

  // Compute R² (coefficient of determination)
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept
    ssRes += (values[i] - predicted) ** 2
    ssTot += (values[i] - meanY) ** 2
  }

  const rSquared = ssTot < 1e-10 ? 1 : Math.max(0, 1 - ssRes / ssTot)

  // Predict at position n + periods - 1
  const predictedValue = slope * (n - 1 + periods) + intercept

  return {
    value: round2(predictedValue),
    method: 'linear',
    confidence: round4(rSquared),
    diagnostics: {
      slope: round4(slope),
      intercept: round4(intercept),
      rSquared: round4(rSquared),
    },
  }
}

// ─── Moving Average ──────────────────────────────────────────────────────────

/**
 * Simple moving average forecast.
 * Returns the average of the last `window` values.
 */
export function forecastMovingAverage(values: number[], window?: number): ForecastResult {
  const n = values.length
  if (n === 0) {
    return { value: 0, method: 'moving_average', confidence: 0 }
  }
  if (n === 1) {
    return { value: values[0], method: 'moving_average', confidence: 0 }
  }

  // Auto window: min(5, floor(n/2)), at least 2
  const w = window ?? Math.max(2, Math.min(5, Math.floor(n / 2)))
  const effectiveWindow = Math.min(w, n)

  // Average of last `effectiveWindow` values
  let sum = 0
  for (let i = n - effectiveWindow; i < n; i++) {
    sum += values[i]
  }
  const avg = sum / effectiveWindow

  // Confidence: 1 - coefficient of variation of the window values
  let variance = 0
  for (let i = n - effectiveWindow; i < n; i++) {
    variance += (values[i] - avg) ** 2
  }
  variance /= effectiveWindow
  const stdDev = Math.sqrt(variance)
  const cv = Math.abs(avg) < 1e-10 ? 1 : stdDev / Math.abs(avg)
  const confidence = Math.max(0, Math.min(1, 1 - cv))

  return {
    value: round2(avg),
    method: 'moving_average',
    confidence: round4(confidence),
    diagnostics: { window: effectiveWindow },
  }
}

// ─── Seasonal Naive ──────────────────────────────────────────────────────────

/**
 * Detect seasonality via autocorrelation and return the value from
 * one season ago as the prediction.
 */
export function forecastSeasonalNaive(values: number[], seasonLength?: number): ForecastResult {
  const n = values.length
  if (n < 4) {
    // Not enough data for seasonality detection
    return { value: values[n - 1] ?? 0, method: 'seasonal_naive', confidence: 0 }
  }

  const period = seasonLength ?? detectSeasonLength(values)

  if (period === 0 || period >= n) {
    // No seasonality detected — fall back to last value
    return { value: values[n - 1], method: 'seasonal_naive', confidence: 0 }
  }

  // Prediction: value from `period` steps ago
  const predictedValue = values[n - period]

  // Confidence: autocorrelation at the detected period
  const correlation = autocorrelation(values, period)

  return {
    value: round2(predictedValue),
    method: 'seasonal_naive',
    confidence: round4(Math.max(0, correlation)),
    diagnostics: { seasonLength: period },
  }
}

/**
 * Detect the dominant seasonal period via autocorrelation.
 * Searches lags from 2 to n/2 and returns the lag with highest positive correlation.
 */
function detectSeasonLength(values: number[]): number {
  const n = values.length
  const maxLag = Math.floor(n / 2)
  if (maxLag < 2) return 0

  let bestLag = 0
  let bestCorr = 0.3 // Minimum threshold to declare seasonality

  for (let lag = 2; lag <= maxLag; lag++) {
    const corr = autocorrelation(values, lag)
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  return bestLag
}

/**
 * Compute autocorrelation at a given lag.
 */
function autocorrelation(values: number[], lag: number): number {
  const n = values.length
  if (lag >= n) return 0

  let mean = 0
  for (let i = 0; i < n; i++) mean += values[i]
  mean /= n

  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n - lag; i++) {
    numerator += (values[i] - mean) * (values[i + lag] - mean)
  }
  for (let i = 0; i < n; i++) {
    denominator += (values[i] - mean) ** 2
  }

  if (Math.abs(denominator) < 1e-10) return 0
  return numerator / denominator
}

// ─── Auto-Select Strategy ────────────────────────────────────────────────────

/**
 * Automatically select the best forecasting method for the given data.
 *
 * Strategy:
 * 1. If linear R² > 0.7 → use linear regression
 * 2. If seasonal period detected (autocorrelation > 0.3) → use seasonal naive
 * 3. Otherwise → use moving average
 */
export function forecast(values: number[], options: ForecastOptions = {}): ForecastResult {
  if (values.length === 0) {
    return { value: 0, method: 'linear', confidence: 0 }
  }

  // If method is forced, use it directly
  if (options.method === 'linear') {
    return forecastLinear(values, options.periods)
  }
  if (options.method === 'moving_average') {
    return forecastMovingAverage(values, options.window)
  }
  if (options.method === 'seasonal_naive') {
    return forecastSeasonalNaive(values, options.seasonLength)
  }

  const periods = options.periods ?? 1

  // Try linear first
  const linear = forecastLinear(values, periods)
  if (linear.confidence > 0.7) {
    return linear
  }

  // Try seasonal detection (need at least 8 data points)
  if (values.length >= 8) {
    const seasonal = forecastSeasonalNaive(values, options.seasonLength)
    if (seasonal.confidence > 0.3) {
      return seasonal
    }
  }

  // Fall back to moving average
  return forecastMovingAverage(values, options.window)
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
