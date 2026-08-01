/**
 * Hybrid Router — Confidence-based three-tier dispatch
 *
 * Routes intent classification through a fallback chain:
 *   1. Local NLP (when engine is ready and confidence ≥ threshold)
 *   2. Server LLM (when confidence is below threshold, with timeout)
 *   3. Regex parser (last resort when NLP unavailable or LLM fails)
 *
 * Appends routing metadata (source, confidence) to every result and
 * a warning when falling back to regex due to LLM failure.
 *
 * @module hybridRouter
 */

import type { NLPEngineClient } from './nlpEngineClient'
import type { ClassificationResult, WorkbookContext } from './types'
import type { UserIntent } from '@shared/intentTypes'

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface RoutingResult {
  intent: UserIntent
  source: 'nlp' | 'llm' | 'regex'
  confidence: number
  latencyMs: number
}

export interface HybridRouterConfig {
  /** Minimum confidence to accept NLP result. Default 0.6, range [0, 1] */
  fallbackThreshold: number
  /** Timeout for server LLM call in ms. Default 5000 */
  llmTimeoutMs: number
  /** Timeout for local NLP classification in ms. Default 500 */
  localTimeoutMs: number
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validates that fallbackThreshold is within [0.0, 1.0].
 * Throws a RangeError if not.
 */
function validateConfig(config: HybridRouterConfig): void {
  if (
    typeof config.fallbackThreshold !== 'number' ||
    Number.isNaN(config.fallbackThreshold) ||
    config.fallbackThreshold < 0 ||
    config.fallbackThreshold > 1
  ) {
    throw new RangeError(
      `fallbackThreshold must be a number in [0.0, 1.0], got: ${config.fallbackThreshold}`
    )
  }
}

/**
 * Races a promise against a timeout. Rejects with a timeout error if
 * the promise doesn't resolve within the given ms.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/**
 * Maps a ClassificationResult from the NLP engine to a UserIntent.
 */
function classificationToIntent(result: ClassificationResult, rawQuery: string): UserIntent {
  return {
    intentType: result.intentType,
    targetColumns: [],
    filters: {},
    parameters: {},
    rawQuery,
    confidence: result.confidence,
    entities: result.entities,
    routingSource: 'nlp',
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates a hybrid router that dispatches classification requests through
 * a three-tier fallback chain: NLP → LLM → Regex.
 *
 * @param nlpClient - The NLP engine client (provides state and classify)
 * @param regexParser - The regex-based intent parser (last resort fallback)
 * @param llmClassifier - Server-side LLM classification function
 * @param config - Router configuration (thresholds and timeouts)
 * @throws RangeError if fallbackThreshold is not in [0.0, 1.0]
 */
export function createHybridRouter(
  nlpClient: NLPEngineClient,
  regexParser: (text: string) => UserIntent,
  llmClassifier: (text: string) => Promise<UserIntent>,
  config: HybridRouterConfig,
): { route(text: string, ctx: WorkbookContext): Promise<RoutingResult> } {
  validateConfig(config)

  return {
    async route(text: string, ctx: WorkbookContext): Promise<RoutingResult> {
      const startTime = performance.now()

      // ─── Step 1: Check NLP engine state ─────────────────────────────
      if (nlpClient.state !== 'ready') {
        // NLP unavailable → skip directly to regex fallback (step 4)
        const intent = regexParser(text)
        intent.routingSource = 'regex'
        return {
          intent,
          source: 'regex',
          confidence: intent.confidence,
          latencyMs: performance.now() - startTime,
        }
      }

      // ─── Step 2: Attempt NLP classification ─────────────────────────
      try {
        const classification = await withTimeout(
          nlpClient.classify(text, ctx),
          config.localTimeoutMs,
          'NLP classification',
        )

        if (classification.confidence >= config.fallbackThreshold) {
          // NLP succeeded with sufficient confidence
          const intent = classificationToIntent(classification, text)
          return {
            intent,
            source: 'nlp',
            confidence: classification.confidence,
            latencyMs: performance.now() - startTime,
          }
        }

        // Confidence below threshold → proceed to LLM (step 3)
      } catch {
        // NLP timed out or errored → proceed to LLM (step 3)
      }

      // ─── Step 3: Attempt LLM classification ─────────────────────────
      try {
        const llmIntent = await withTimeout(
          llmClassifier(text),
          config.llmTimeoutMs,
          'LLM classification',
        )
        llmIntent.routingSource = 'llm'
        return {
          intent: llmIntent,
          source: 'llm',
          confidence: llmIntent.confidence,
          latencyMs: performance.now() - startTime,
        }
      } catch {
        // LLM timed out or errored → fall through to regex (step 4)
      }

      // ─── Step 4: Regex fallback ─────────────────────────────────────
      const intent = regexParser(text)
      intent.routingSource = 'regex'
      // Append warning when falling back due to LLM failure
      intent.parameters = {
        ...intent.parameters,
        _fallbackWarning: 'Result produced by fallback parser with reduced confidence',
      }

      return {
        intent,
        source: 'regex',
        confidence: intent.confidence,
        latencyMs: performance.now() - startTime,
      }
    },
  }
}
