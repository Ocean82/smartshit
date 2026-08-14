/**
 * LLM provider utilities — extracted to avoid circular dependencies.
 * Both index.ts and llmIntentParser.ts import from here.
 *
 * Features:
 * - Pass jsonMode to ALL providers (not just Groq)
 * - Include provider identity metadata in responses
 * - Support configurable maxTokens for act/tool calls
 * - Properly cascade failover with logging
 * - Circuit breaker: skip providers that have failed repeatedly
 * - Per-provider timeout: abort slow providers before blocking the user
 */
import { config } from './config.js'
import { chatWithOllama, chatWithOllamaStream } from './ollama.js'
import { groqAvailable, chatWithGroqStream, recordGroqFallback } from './groq.js'
import { chatWithOpenAiCompatible, chatWithOpenAiCompatibleStream, openAiCompatibleAvailable } from './openaiCompatible.js'

export type ProviderName = 'openrouter' | 'huggingface' | 'groq' | 'ollama'

/** Canonical list of supported LLM provider identifiers. */
export const ALLOWED_PROVIDERS: readonly ProviderName[] = ['openrouter', 'huggingface', 'groq', 'ollama'] as const

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

/**
 * Simple circuit breaker per provider.
 *
 * States:
 * - CLOSED: provider is healthy, requests pass through
 * - OPEN: provider has failed too many times, skip it
 * - HALF_OPEN: cooldown expired, allow one probe request
 *
 * Transitions:
 * - CLOSED → OPEN: after `failureThreshold` consecutive failures
 * - OPEN → HALF_OPEN: after `cooldownMs` has elapsed
 * - HALF_OPEN → CLOSED: if the probe succeeds
 * - HALF_OPEN → OPEN: if the probe fails (resets cooldown timer)
 */
interface CircuitState {
  failures: number
  lastFailureAt: number
  isOpen: boolean
}

const CIRCUIT_FAILURE_THRESHOLD = 3
const CIRCUIT_COOLDOWN_MS = 60_000 // 1 minute

const circuitStates = new Map<ProviderName, CircuitState>()

function getCircuitState(provider: ProviderName): CircuitState {
  if (!circuitStates.has(provider)) {
    circuitStates.set(provider, { failures: 0, lastFailureAt: 0, isOpen: false })
  }
  return circuitStates.get(provider)!
}

/** Check if a provider's circuit is open (should be skipped). */
function isCircuitOpen(provider: ProviderName): boolean {
  const state = getCircuitState(provider)
  if (!state.isOpen) return false

  // Check if cooldown has elapsed (transition to half-open — allow one probe)
  if (Date.now() - state.lastFailureAt >= CIRCUIT_COOLDOWN_MS) {
    return false // half-open: allow the attempt
  }

  return true // still in cooldown
}

/** Record a successful call — resets the circuit. */
function recordSuccess(provider: ProviderName): void {
  const state = getCircuitState(provider)
  state.failures = 0
  state.isOpen = false
}

/** Record a failed call — may trip the circuit open. */
function recordFailure(provider: ProviderName): void {
  const state = getCircuitState(provider)
  state.failures++
  state.lastFailureAt = Date.now()

  if (state.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    state.isOpen = true
  }
}

/** Get circuit breaker status for observability. */
export function getCircuitBreakerStatus(): Record<ProviderName, { failures: number; isOpen: boolean }> {
  const status: Record<string, { failures: number; isOpen: boolean }> = {}
  for (const provider of ALLOWED_PROVIDERS) {
    const state = getCircuitState(provider)
    status[provider] = { failures: state.failures, isOpen: isCircuitOpen(provider) }
  }
  return status as Record<ProviderName, { failures: number; isOpen: boolean }>
}

// ─── Per-Provider Timeout ─────────────────────────────────────────────────────

/**
 * Timeout per provider call in milliseconds.
 * Cloud providers get a shorter timeout since they're fast when healthy.
 * Ollama (local) gets longer since first inference on cold models is slow.
 */
const PROVIDER_TIMEOUT_MS: Record<ProviderName, number> = {
  groq: 20_000,        // 20s — Groq is very fast, timeout means it's down
  openrouter: 30_000,  // 30s — routing can add latency
  huggingface: 30_000, // 30s — cold starts possible
  ollama: 90_000,      // 90s — first load of 4B model can be slow
}

/**
 * Wrap a promise with a per-provider timeout.
 * If the timeout fires, rejects with a descriptive error.
 */
function withTimeout<T>(promise: Promise<T>, provider: ProviderName, existingSignal?: AbortSignal): Promise<T> {
  const timeoutMs = PROVIDER_TIMEOUT_MS[provider]

  return new Promise<T>((resolve, reject) => {
    // If the caller's signal is already aborted, reject immediately
    if (existingSignal?.aborted) {
      reject(new Error(`Request aborted before calling ${provider}`))
      return
    }

    const timer = setTimeout(() => {
      reject(new Error(`Provider ${provider} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // Also reject if the external signal aborts
    const abortHandler = () => {
      clearTimeout(timer)
      reject(new Error(`Request aborted while calling ${provider}`))
    }
    existingSignal?.addEventListener('abort', abortHandler, { once: true })

    promise
      .then((result) => {
        clearTimeout(timer)
        existingSignal?.removeEventListener('abort', abortHandler)
        resolve(result)
      })
      .catch((err) => {
        clearTimeout(timer)
        existingSignal?.removeEventListener('abort', abortHandler)
        reject(err)
      })
  })
}

export function providerOrder(): ProviderName[] {
  return config.llmProviderOrder.filter((provider): provider is ProviderName =>
    ALLOWED_PROVIDERS.includes(provider as ProviderName),
  )
}

export function providerIsConfigured(provider: ProviderName): boolean {
  if (provider === 'openrouter') {
    return openAiCompatibleAvailable({
      apiKey: config.openRouterApiKey,
      model: config.openRouterModel,
      baseUrl: config.openRouterBaseUrl,
    })
  }
  if (provider === 'huggingface') {
    return openAiCompatibleAvailable({
      apiKey: config.huggingFaceApiKey,
      model: config.huggingFaceModel,
      baseUrl: config.huggingFaceBaseUrl,
    })
  }
  if (provider === 'groq') return groqAvailable()
  return true
}

export interface ProviderCallOptions {
  /** Enable JSON mode for structured output (action mode). */
  jsonMode?: boolean
  /** Override max_tokens. Default: 1280 for Groq, 768 for others. Use 2048+ for act/tool calls. */
  maxTokens?: number
}

/** Metadata about which provider/model handled the request. */
export interface ProviderMeta {
  provider: ProviderName
  model: string
  latencyMs: number
}

/** Response from a provider call including the text and metadata. */
export interface ProviderResponse {
  text: string
  meta: ProviderMeta
}

/** Resolve the model name for a given provider. */
export function getModelName(provider: ProviderName): string {
  switch (provider) {
    case 'groq': return config.groqModel
    case 'openrouter': return config.openRouterModel
    case 'huggingface': return config.huggingFaceModel
    case 'ollama': return config.modelName
  }
}

export async function callProviderStream(
  provider: ProviderName,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const start = performance.now()

  // Wrap onChunk to detect first-byte timing for timeout enforcement.
  // The timeout fires if NO chunk arrives within the provider's timeout window.
  // Once the first chunk arrives, the timeout is disarmed (the stream is live).
  const timeoutMs = PROVIDER_TIMEOUT_MS[provider]
  let firstChunkReceived = false
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  const streamPromise = new Promise<string>((resolve, reject) => {
    // Set up first-byte timeout
    timeoutTimer = setTimeout(() => {
      if (!firstChunkReceived) {
        reject(new Error(`Provider ${provider} stream timed out: no data received within ${timeoutMs}ms`))
      }
    }, timeoutMs)

    // Also abort on external signal
    if (signal.aborted) {
      clearTimeout(timeoutTimer)
      reject(new Error(`Request aborted before calling ${provider}`))
      return
    }
    const abortHandler = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer)
      reject(new Error(`Request aborted while streaming from ${provider}`))
    }
    signal.addEventListener('abort', abortHandler, { once: true })

    const wrappedOnChunk = (chunk: string) => {
      if (!firstChunkReceived) {
        firstChunkReceived = true
        if (timeoutTimer) {
          clearTimeout(timeoutTimer)
          timeoutTimer = null
        }
      }
      onChunk(chunk)
    }

    let innerPromise: Promise<string>
    if (provider === 'openrouter') {
      innerPromise = chatWithOpenAiCompatibleStream(
        {
          apiKey: config.openRouterApiKey,
          model: config.openRouterModel,
          baseUrl: config.openRouterBaseUrl,
        },
        messages,
        wrappedOnChunk,
        signal,
        { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
      )
    } else if (provider === 'huggingface') {
      innerPromise = chatWithOpenAiCompatibleStream(
        {
          apiKey: config.huggingFaceApiKey,
          model: config.huggingFaceModel,
          baseUrl: config.huggingFaceBaseUrl,
        },
        messages,
        wrappedOnChunk,
        signal,
        { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
      )
    } else if (provider === 'groq') {
      innerPromise = chatWithGroqStream(messages, wrappedOnChunk, signal, {
        jsonMode: options.jsonMode,
        maxTokens: options.maxTokens,
      })
    } else {
      innerPromise = chatWithOllamaStream(messages, wrappedOnChunk, signal, {
        jsonMode: options.jsonMode,
      })
    }

    innerPromise
      .then((result) => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        signal.removeEventListener('abort', abortHandler)
        resolve(result)
      })
      .catch((err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        signal.removeEventListener('abort', abortHandler)
        reject(err)
      })
  })

  const text = await streamPromise

  return {
    text,
    meta: {
      provider,
      model: getModelName(provider),
      latencyMs: Math.round(performance.now() - start),
    },
  }
}

export async function callProvider(
  provider: ProviderName,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const start = performance.now()
  let text: string

  if (provider === 'openrouter') {
    text = await chatWithOpenAiCompatible(
      {
        apiKey: config.openRouterApiKey,
        model: config.openRouterModel,
        baseUrl: config.openRouterBaseUrl,
      },
      messages,
      { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
    )
  } else if (provider === 'huggingface') {
    text = await chatWithOpenAiCompatible(
      {
        apiKey: config.huggingFaceApiKey,
        model: config.huggingFaceModel,
        baseUrl: config.huggingFaceBaseUrl,
      },
      messages,
      { jsonMode: options.jsonMode, maxTokens: options.maxTokens },
    )
  } else if (provider === 'groq') {
    const { chatWithGroq } = await import('./groq.js')
    text = await chatWithGroq(messages, {
      jsonMode: options.jsonMode,
      maxTokens: options.maxTokens,
    })
  } else {
    // Primary Ollama model — use JSON format when structured output is needed.
    text = await chatWithOllama(messages, { jsonMode: options.jsonMode })
  }

  return {
    text,
    meta: {
      provider,
      model: getModelName(provider),
      latencyMs: Math.round(performance.now() - start),
    },
  }
}

/**
 * Call providers in failover order, returning the first successful response.
 * Skips providers whose circuit breaker is open (tripped after repeated failures).
 * Applies per-provider timeouts to prevent slow providers from blocking.
 * Throws if all providers fail (fail-closed behavior).
 */
export async function callProviderWithFailover(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const providers = providerOrder().filter(providerIsConfigured)

  if (providers.length === 0) {
    throw new Error('No AI providers configured or available')
  }

  let lastError: Error | null = null
  const skipped: ProviderName[] = []

  for (const provider of providers) {
    // Circuit breaker: skip providers that have failed repeatedly
    if (isCircuitOpen(provider)) {
      skipped.push(provider)
      continue
    }

    try {
      const response = await withTimeout(
        callProvider(provider, messages, options),
        provider,
      )
      recordSuccess(provider)
      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      recordFailure(provider)
      console.warn(`[providers] ${provider} failed, trying next:`, lastError.message)

      if (provider === 'groq') {
        recordGroqFallback()
      }
    }
  }

  // All providers exhausted — fail closed
  const skippedNote = skipped.length > 0 ? ` Skipped (circuit open): ${skipped.join(', ')}.` : ''
  throw new Error(
    `All AI providers failed. Last error: ${lastError?.message ?? 'unknown'}. ` +
    `Tried: ${providers.filter((p) => !skipped.includes(p)).join(', ')}.${skippedNote}`
  )
}

export { recordGroqFallback, isCircuitOpen, recordSuccess, recordFailure, withTimeout }

/**
 * Stream from providers in failover order.
 * Skips providers whose circuit breaker is open.
 * Applies first-byte timeouts per provider.
 * Records success/failure to circuit breaker.
 * Throws if all providers fail (fail-closed behavior).
 *
 * Note: Once a provider starts streaming successfully, failover stops.
 * A mid-stream failure after the first chunk is NOT retried (partial content
 * has already been sent to the client).
 */
export async function callProviderStreamWithFailover(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
  options: ProviderCallOptions = {},
): Promise<ProviderResponse> {
  const providers = providerOrder().filter(providerIsConfigured)

  if (providers.length === 0) {
    throw new Error('No AI providers configured or available')
  }

  let lastError: Error | null = null
  const skipped: ProviderName[] = []

  for (const provider of providers) {
    if (isCircuitOpen(provider)) {
      skipped.push(provider)
      continue
    }

    try {
      const response = await callProviderStream(provider, messages, onChunk, signal, options)
      recordSuccess(provider)
      return response
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      recordFailure(provider)
      console.warn(`[providers] ${provider} stream failed, trying next:`, lastError.message)

      if (provider === 'groq') {
        recordGroqFallback()
      }

      // If the signal was aborted, don't try more providers — user cancelled
      if (signal.aborted) {
        throw lastError
      }
    }
  }

  const skippedNote = skipped.length > 0 ? ` Skipped (circuit open): ${skipped.join(', ')}.` : ''
  throw new Error(
    `All AI providers failed (streaming). Last error: ${lastError?.message ?? 'unknown'}. ` +
    `Tried: ${providers.filter((p) => !skipped.includes(p)).join(', ')}.${skippedNote}`
  )
}
