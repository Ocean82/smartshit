/**
 * Fallback Threshold Configuration
 *
 * Validates and manages the configurable Fallback_Threshold used by
 * the hybrid router to decide when to escalate from local NLP to server LLM.
 *
 * @module thresholdConfig
 */

import type { NLPConfig } from './types'

/**
 * The default fallback threshold value.
 * Used when no threshold is explicitly configured.
 */
export const DEFAULT_FALLBACK_THRESHOLD = 0.6

/**
 * Validates and normalizes a fallback threshold value.
 *
 * @param value - The threshold value to validate (may be undefined for default)
 * @returns A valid threshold in [0.0, 1.0]
 * @throws Error if the value is NaN, Infinity, or outside [0.0, 1.0]
 */
export function validateFallbackThreshold(value?: number | null): number {
  if (value === undefined || value === null) {
    return DEFAULT_FALLBACK_THRESHOLD
  }

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(
      `Invalid fallback threshold: value is NaN. Must be a number in [0.0, 1.0].`
    )
  }

  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid fallback threshold: ${value}. Must be a finite number in [0.0, 1.0].`
    )
  }

  if (value < 0.0 || value > 1.0) {
    throw new Error(
      `Invalid fallback threshold: ${value}. Must be in the range [0.0, 1.0].`
    )
  }

  return value
}

/**
 * Creates a validated NLP configuration with fallback threshold.
 * Merges provided config with defaults, validates threshold.
 *
 * @param partial - Optional partial config containing fallbackThreshold
 * @returns A validated config object with the fallbackThreshold
 * @throws Error if the provided fallbackThreshold is invalid
 */
export function createValidatedConfig(
  partial?: Partial<Pick<NLPConfig, 'fallbackThreshold'>>
): { fallbackThreshold: number } {
  const threshold = validateFallbackThreshold(partial?.fallbackThreshold)
  return { fallbackThreshold: threshold }
}
