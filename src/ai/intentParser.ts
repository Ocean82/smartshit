/**
 * Intent Parser Facade — Routes between NLP engine and regex parser
 *
 * This module is the primary import point for intent parsing in the application.
 * It maintains identical synchronous `parseUserIntent` and `isQueryIntent` signatures
 * for backward compatibility with the Brain orchestrator, while adding async NLP-based
 * parsing via `parseUserIntentAsync`.
 *
 * Routing strategy:
 * - `parseUserIntent(msg)` → always synchronous, uses regex parser (safe for all call sites)
 * - `parseUserIntentAsync(msg, ctx?)` → uses NLP when ready, falls back to regex on error/timeout
 *
 * The NLP engine is initialized via `initializeNLPEngine()` at app startup.
 * If the engine doesn't reach the ready state within 30 seconds, a warning is logged.
 * On any NLP error, the facade falls back to regex and returns a valid UserIntent within 2 seconds.
 *
 * Seamless transition:
 * - In-flight requests that started with regex (during loading) complete normally
 * - In-flight requests that started with NLP (during ready) complete via NLP or fall back on error
 * - State transitions mid-request never drop or duplicate responses
 *
 * @module intentParser
 */

import {
  parseUserIntent as regexParseUserIntent,
  isQueryIntent,
  serializeIntent,
  deserializeIntent,
} from '@shared/intentParser'
import type { UserIntent } from '@shared/intentTypes'
import { createNLPEngineClient, type NLPEngineClient } from '@/ai/nlp/nlpEngineClient'
import type { NLPEngineState, NLPConfig, WorkbookContext } from '@/ai/nlp/types'
import { createHybridRouter, type HybridRouterConfig, type RoutingResult } from '@/ai/nlp/hybridRouter'

// ─── Re-exports (maintain identical public API) ─────────────────────────────

export { isQueryIntent, serializeIntent, deserializeIntent }
export type { UserIntent } from '@shared/intentTypes'
export type { IntentType } from '@shared/intentTypes'

// ─── Module State ───────────────────────────────────────────────────────────

let nlpClient: NLPEngineClient | null = null
let nlpState: NLPEngineState = 'loading'
let nlpInitialized = false
let readinessWarningLogged = false
let readinessTimer: ReturnType<typeof setTimeout> | null = null
let stateUnsubscribe: (() => void) | null = null

/** The hybrid router instance, created on initialization */
let router: { route(text: string, ctx: WorkbookContext): Promise<RoutingResult> } | null = null

/** Track in-flight async requests to ensure none are dropped during transitions */
let inFlightCount = 0

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum time to wait for NLP readiness before logging a warning (ms) */
const NLP_READINESS_WARN_MS = 30_000

/** Maximum time to wait for a fallback response (ms) */
const FALLBACK_TIMEOUT_MS = 2_000

// ─── Synchronous Parser (Backward-Compatible) ──────────────────────────────

/**
 * Parses user intent synchronously using the regex parser.
 *
 * This function always returns a `UserIntent` synchronously, matching the
 * existing call-site expectations in brain.ts and other consumers.
 * For NLP-based parsing, use `parseUserIntentAsync`.
 *
 * When the NLP engine is ready, prefer `parseUserIntentAsync` to benefit
 * from semantic classification. This synchronous version always uses regex
 * regardless of NLP engine state (Req 4.3: regex while loading).
 *
 * @param userMessage - The raw user input text
 * @returns A UserIntent with regex-based classification
 */
export function parseUserIntent(userMessage: string): UserIntent {
  const intent = regexParseUserIntent(userMessage)
  intent.routingSource = 'regex'
  return intent
}

// ─── Async NLP Parser ───────────────────────────────────────────────────────

/**
 * Parses user intent asynchronously, routing to NLP when the engine is ready
 * and falling back to regex when loading or on error.
 *
 * Guarantees (Requirements 4.2–4.7):
 * - Uses NLP_Engine when state is 'ready' (Req 4.2)
 * - Uses Regex_Parser when state is 'loading' or 'fallback' (Req 4.3)
 * - Returns a valid UserIntent within 2 seconds even on NLP failure (Req 4.5)
 * - Never throws; always returns a valid result
 * - In-flight requests complete without being dropped during state transitions (Req 4.6)
 * - Routing metadata indicates which parser produced the result
 *
 * @param userMessage - The raw user input text
 * @param workbookContext - Optional workbook context for entity resolution
 * @returns A UserIntent with routing metadata indicating the source
 */
export async function parseUserIntentAsync(
  userMessage: string,
  workbookContext?: WorkbookContext,
): Promise<UserIntent> {
  // Capture state at request start — this ensures the routing decision
  // is consistent for this request even if state changes mid-flight (Req 4.6)
  const stateAtRequestStart = nlpState

  // If NLP is not initialized or not ready, use regex immediately (Req 4.3)
  if (!nlpInitialized || stateAtRequestStart !== 'ready' || !router) {
    return parseUserIntent(userMessage)
  }

  // Build a default workbook context if none provided
  const ctx: WorkbookContext = workbookContext ?? {
    activeSheetId: '',
    sheets: [],
  }

  inFlightCount++
  try {
    // Race the NLP routing against a 2-second timeout (Req 4.5)
    const result = await withFallbackTimeout(
      router.route(userMessage, ctx),
      FALLBACK_TIMEOUT_MS,
    )
    return result.intent
  } catch {
    // On any error (NLP failure, timeout), fall back to regex (Req 4.5)
    console.warn('[IntentParser] NLP routing failed, falling back to regex:', userMessage.slice(0, 50))
    return parseUserIntent(userMessage)
  } finally {
    inFlightCount--
  }
}

// ─── NLP Engine Lifecycle ───────────────────────────────────────────────────

/**
 * Initializes the NLP engine and sets up hybrid routing.
 *
 * Call this once at application startup. The engine loads in a Web Worker
 * (non-blocking) and transitions to 'ready' state when the model is loaded.
 * If the engine doesn't reach 'ready' within 30 seconds, a warning is logged (Req 4.7).
 *
 * @param config - NLP configuration
 * @param llmClassifier - Server-side LLM classification function for hybrid routing
 * @returns A cleanup function to dispose the engine
 */
export function initializeNLPEngine(
  config: NLPConfig,
  llmClassifier: (text: string) => Promise<UserIntent>,
): () => void {
  // Prevent double initialization
  if (nlpInitialized && nlpClient) {
    console.warn('[IntentParser] NLP engine already initialized')
    return () => disposeNLPEngine()
  }

  nlpClient = createNLPEngineClient(config)
  nlpState = nlpClient.state
  nlpInitialized = true
  readinessWarningLogged = false

  // Set up router configuration
  const routerConfig: HybridRouterConfig = {
    fallbackThreshold: config.fallbackThreshold,
    llmTimeoutMs: 5_000,
    localTimeoutMs: config.inferenceTimeoutMs,
  }

  // Create the hybrid router with the NLP client, regex fallback, and LLM
  router = createHybridRouter(
    nlpClient,
    regexParseUserIntent,
    llmClassifier,
    routerConfig,
  )

  // Listen for state changes to track NLP readiness
  stateUnsubscribe = nlpClient.onStateChange((newState: NLPEngineState) => {
    const previousState = nlpState
    nlpState = newState

    // Clear the readiness timer when engine becomes ready
    if (newState === 'ready' && readinessTimer) {
      clearTimeout(readinessTimer)
      readinessTimer = null
    }

    // Log state transitions for debugging
    if (previousState !== newState) {
      console.info(`[IntentParser] NLP engine state: ${previousState} → ${newState}`)
    }
  })

  // Start 30-second readiness warning timer (Req 4.7)
  readinessTimer = setTimeout(() => {
    if (nlpState !== 'ready' && !readinessWarningLogged) {
      readinessWarningLogged = true
      console.warn(
        '[IntentParser] NLP engine has not reached ready state within 30 seconds. ' +
        'Continuing with regex parser until NLP becomes available.',
      )
    }
  }, NLP_READINESS_WARN_MS)

  return () => disposeNLPEngine()
}

/**
 * Returns the current state of the NLP engine.
 *
 * @returns The current NLPEngineState, or 'loading' if not initialized
 */
export function getNLPEngineState(): NLPEngineState {
  if (!nlpInitialized) return 'loading'
  return nlpState
}

/**
 * Returns whether the NLP engine is initialized and ready for classification.
 */
export function isNLPReady(): boolean {
  return nlpInitialized && nlpState === 'ready'
}

/**
 * Returns the number of in-flight async parse requests.
 * Useful for ensuring graceful shutdown (no dropped requests).
 */
export function getInFlightCount(): number {
  return inFlightCount
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Disposes the NLP engine and cleans up all resources.
 * In-flight requests will resolve via their existing fallback paths.
 */
function disposeNLPEngine(): void {
  if (readinessTimer) {
    clearTimeout(readinessTimer)
    readinessTimer = null
  }

  if (stateUnsubscribe) {
    stateUnsubscribe()
    stateUnsubscribe = null
  }

  if (nlpClient) {
    nlpClient.dispose()
    nlpClient = null
  }

  router = null
  nlpInitialized = false
  nlpState = 'loading'
  readinessWarningLogged = false
}

/**
 * Races a promise against a timeout, rejecting if the promise doesn't
 * resolve within the specified duration. Ensures we always return
 * within the specified window (Req 4.5: valid UserIntent within 2s).
 */
function withFallbackTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`NLP fallback timeout after ${ms}ms`))
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

// ─── Testing Utilities ──────────────────────────────────────────────────────

/**
 * Resets the module state for testing purposes.
 * @internal
 */
export function _resetForTesting(): void {
  disposeNLPEngine()
  inFlightCount = 0
}
