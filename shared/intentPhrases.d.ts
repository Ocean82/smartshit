import type { IntentType } from './intentTypes'

/**
 * Intent reference phrases — single source of truth.
 * See intentPhrases.js for documentation.
 */
export declare const INTENT_PHRASES: Record<IntentType, string[]>

/**
 * Deterministic unsigned 32-bit FNV-1a hash of the intent phrase set.
 * Used to detect stale precomputed intent-vectors.bin.
 */
export declare function intentPhrasesHash(
  phrases?: Record<string, string[]>,
): number
