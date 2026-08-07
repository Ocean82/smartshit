/**
 * Scoring Engine — Deterministic AI.SCORE replacement.
 *
 * Replaces the LLM "score from 0-100" hallucination with proper statistical
 * methods: percentile rank, z-score normalization, and rubric-based scoring.
 *
 * All functions are pure, stateless, and deterministic.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScoreResult {
  /** Score from 0 to 100 */
  score: number
  /** Which method was used */
  method: 'percentile' | 'z_score' | 'rubric' | 'length' | 'completeness'
  /** Optional breakdown of sub-scores */
  breakdown?: Record<string, number>
}

export interface ScoreOptions {
  /** Scoring criteria hint (e.g., "quality", "length", "completeness") */
  criteria?: string
  /** Reference distribution for percentile/z-score methods */
  distribution?: number[]
  /** Mean for z-score (if distribution not provided) */
  mean?: number
  /** Standard deviation for z-score */
  stddev?: number
}

// ─── Percentile Rank ─────────────────────────────────────────────────────────

/**
 * Score a value based on its percentile rank within a distribution.
 * Returns 0-100 indicating what percentage of the distribution falls below.
 */
export function scoreByPercentile(value: number, distribution: number[]): ScoreResult {
  if (distribution.length === 0) {
    return { score: 50, method: 'percentile' }
  }

  const sorted = [...distribution].sort((a, b) => a - b)
  const n = sorted.length

  // Count values below and equal
  let below = 0
  let equal = 0
  for (const v of sorted) {
    if (v < value) below++
    else if (v === value) equal++
  }

  // Percentile rank formula: (below + 0.5 * equal) / n * 100
  const percentile = ((below + 0.5 * equal) / n) * 100
  return {
    score: Math.round(Math.max(0, Math.min(100, percentile))),
    method: 'percentile',
  }
}

// ─── Z-Score Normalization ───────────────────────────────────────────────────

/**
 * Score a value using z-score normalization.
 * Maps the z-score to 0-100 using a sigmoid-like transform:
 * - z = 0 → 50
 * - z = +2 → ~95
 * - z = -2 → ~5
 */
export function scoreByZScore(value: number, mean: number, stddev: number): ScoreResult {
  if (stddev <= 0) {
    return { score: value === mean ? 50 : value > mean ? 100 : 0, method: 'z_score' }
  }

  const z = (value - mean) / stddev
  // Map z-score to 0-100 using CDF approximation (logistic sigmoid)
  const score = 100 / (1 + Math.exp(-1.7 * z))

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    method: 'z_score',
    breakdown: { zScore: Math.round(z * 100) / 100 },
  }
}

// ─── Z-Score from Distribution ───────────────────────────────────────────────

/**
 * Score a value by computing z-score from a reference distribution.
 */
export function scoreByDistribution(value: number, distribution: number[]): ScoreResult {
  if (distribution.length === 0) {
    return { score: 50, method: 'z_score' }
  }

  const n = distribution.length
  let sum = 0
  for (const v of distribution) sum += v
  const mean = sum / n

  let variance = 0
  for (const v of distribution) variance += (v - mean) ** 2
  variance /= n
  const stddev = Math.sqrt(variance)

  return scoreByZScore(value, mean, stddev)
}

// ─── Text-Based Scoring (Rubrics) ────────────────────────────────────────────

/**
 * Score text by length (normalized to a reasonable range).
 * Assumes "longer = more complete" up to a ceiling.
 */
export function scoreByLength(text: string, maxLength = 500): ScoreResult {
  const len = text.trim().length
  const score = Math.min(100, Math.round((len / maxLength) * 100))
  return {
    score,
    method: 'length',
    breakdown: { characters: len, maxExpected: maxLength },
  }
}

/**
 * Score text by completeness heuristics:
 * - Has content (not empty)
 * - Reasonable length
 * - Contains numbers (data-rich)
 * - Contains proper sentences
 * Each factor contributes 25 points.
 */
export function scoreByCompleteness(text: string): ScoreResult {
  const trimmed = text.trim()
  const breakdown: Record<string, number> = {}
  let total = 0

  // Factor 1: Has content
  const hasContent = trimmed.length > 0 ? 25 : 0
  breakdown.hasContent = hasContent
  total += hasContent

  // Factor 2: Reasonable length (20+ chars = full marks, proportional below)
  const lengthScore = Math.min(25, Math.round((trimmed.length / 20) * 25))
  breakdown.length = lengthScore
  total += lengthScore

  // Factor 3: Contains numbers/data
  const hasNumbers = /\d/.test(trimmed) ? 25 : 0
  breakdown.hasData = hasNumbers
  total += hasNumbers

  // Factor 4: Proper structure (has spaces = multi-word, period/comma = sentences)
  const hasStructure = /\s/.test(trimmed) && /[.,;:!?]/.test(trimmed) ? 25 :
    /\s/.test(trimmed) ? 15 : 0
  breakdown.structure = hasStructure
  total += hasStructure

  return { score: Math.min(100, total), method: 'completeness', breakdown }
}

// ─── Auto-Select Strategy ────────────────────────────────────────────────────

/**
 * Automatically score a value based on available context.
 *
 * Strategy:
 * 1. If distribution provided → percentile rank
 * 2. If mean + stddev provided → z-score
 * 3. If value is a number → attempt z-score with default assumptions
 * 4. If value is text → score by completeness
 */
export function score(value: string | number, options: ScoreOptions = {}): ScoreResult {
  // If distribution provided, use percentile
  if (options.distribution && options.distribution.length > 0) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value))
    if (!isNaN(numValue)) {
      return scoreByPercentile(numValue, options.distribution)
    }
  }

  // If mean/stddev provided, use z-score
  if (options.mean !== undefined && options.stddev !== undefined) {
    const numValue = typeof value === 'number' ? value : parseFloat(String(value))
    if (!isNaN(numValue)) {
      return scoreByZScore(numValue, options.mean, options.stddev)
    }
  }

  // If value is numeric without context, score relative to 0-100 assumption
  const numValue = typeof value === 'number' ? value : parseFloat(String(value))
  if (!isNaN(numValue)) {
    // Without context, clamp to 0-100 directly
    return {
      score: Math.round(Math.max(0, Math.min(100, numValue))),
      method: 'rubric',
    }
  }

  // Text value — score by criteria hint
  const text = String(value)
  const criteria = (options.criteria ?? 'quality').toLowerCase()

  if (criteria === 'length' || criteria === 'detail' || criteria === 'verbosity') {
    return scoreByLength(text)
  }

  // Default: completeness rubric
  return scoreByCompleteness(text)
}
