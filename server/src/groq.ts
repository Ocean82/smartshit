import { config } from './config.js'
import type { ChatMessageInput } from './prompt.js'

/**
 * Groq API client — OpenAI-compatible endpoint.
 * Primary AI backend for production (sub-1-second responses).
 *
 * Features:
 * - Rate-limit detection and logging (429 responses, header tracking)
 * - JSON mode for reliable structured output
 * - Usage tracking for alerting
 */

interface GroqChoice {
  message?: { role: string; content: string }
}

interface GroqResponse {
  choices?: GroqChoice[]
  error?: { message: string }
}

// ─── Rate Limit Tracking ────────────────────────────────────────────────────

interface RateLimitState {
  /** Total requests made today */
  requestsToday: number
  /** Timestamp of the current tracking day (midnight UTC) */
  dayStartMs: number
  /** Last time a 429 was received */
  lastRateLimitAt: number | null
  /** Number of 429s received today */
  rateLimitsToday: number
  /** Remaining requests from last response header */
  remainingRequests: number | null
  /** Remaining tokens from last response header */
  remainingTokens: number | null
  /** Consecutive Ollama fallbacks (reset on Groq success) */
  consecutiveFallbacks: number
}

const rateLimitState: RateLimitState = {
  requestsToday: 0,
  dayStartMs: getTodayMidnightMs(),
  lastRateLimitAt: null,
  rateLimitsToday: 0,
  remainingRequests: null,
  remainingTokens: null,
  consecutiveFallbacks: 0,
}

function getTodayMidnightMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function resetDayIfNeeded(): void {
  const todayMs = getTodayMidnightMs()
  if (rateLimitState.dayStartMs < todayMs) {
    rateLimitState.requestsToday = 0
    rateLimitState.rateLimitsToday = 0
    rateLimitState.dayStartMs = todayMs
  }
}

/**
 * Parse rate-limit headers from Groq response.
 * Groq sends: x-ratelimit-remaining-requests, x-ratelimit-remaining-tokens,
 * x-ratelimit-limit-requests, x-ratelimit-limit-tokens
 */
function trackRateLimitHeaders(res: Response): void {
  const remaining = res.headers.get('x-ratelimit-remaining-requests')
  const remainingTokens = res.headers.get('x-ratelimit-remaining-tokens')

  if (remaining !== null) {
    rateLimitState.remainingRequests = parseInt(remaining, 10)
  }
  if (remainingTokens !== null) {
    rateLimitState.remainingTokens = parseInt(remainingTokens, 10)
  }

  // Alert at 80% usage (less than 20% remaining)
  const limitRequests = res.headers.get('x-ratelimit-limit-requests')
  if (limitRequests && remaining) {
    const limit = parseInt(limitRequests, 10)
    const rem = parseInt(remaining, 10)
    const usagePercent = ((limit - rem) / limit) * 100

    if (usagePercent >= 80) {
      console.warn(
        `[groq] ⚠️ RATE LIMIT WARNING: ${usagePercent.toFixed(0)}% of request quota used. ` +
        `Remaining: ${rem}/${limit} requests. Consider adding a backup provider.`
      )
    }
  }
}

/**
 * Handle a 429 rate-limit response.
 */
function handleRateLimit(res: Response): void {
  rateLimitState.lastRateLimitAt = Date.now()
  rateLimitState.rateLimitsToday++

  const retryAfter = res.headers.get('retry-after')
  const resetRequests = res.headers.get('x-ratelimit-reset-requests')

  console.error(
    `[groq] 🚨 RATE LIMITED (429). ` +
    `Rate limits hit today: ${rateLimitState.rateLimitsToday}. ` +
    `Retry-After: ${retryAfter ?? 'unknown'}s. ` +
    `Reset: ${resetRequests ?? 'unknown'}. ` +
    `Falling back to next provider.`
  )
}

/**
 * Record a successful Groq call — resets consecutive fallback counter.
 */
function recordSuccess(): void {
  resetDayIfNeeded()
  rateLimitState.requestsToday++
  rateLimitState.consecutiveFallbacks = 0
}

/**
 * Record an Ollama fallback (called by the provider layer on Groq failure).
 */
export function recordGroqFallback(): void {
  rateLimitState.consecutiveFallbacks++
  if (rateLimitState.consecutiveFallbacks >= 5) {
    console.warn(
      `[groq] ⚠️ ${rateLimitState.consecutiveFallbacks} consecutive fallbacks to Ollama. ` +
      `Groq may be rate-limited or down. Last 429: ${rateLimitState.lastRateLimitAt ? new Date(rateLimitState.lastRateLimitAt).toISOString() : 'never'}`
    )
  }
}

/**
 * Get current rate limit usage stats (for health/admin endpoints).
 */
export function getGroqUsageStats() {
  resetDayIfNeeded()
  return {
    requestsToday: rateLimitState.requestsToday,
    rateLimitsToday: rateLimitState.rateLimitsToday,
    lastRateLimitAt: rateLimitState.lastRateLimitAt
      ? new Date(rateLimitState.lastRateLimitAt).toISOString()
      : null,
    remainingRequests: rateLimitState.remainingRequests,
    remainingTokens: rateLimitState.remainingTokens,
    consecutiveFallbacks: rateLimitState.consecutiveFallbacks,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function groqAvailable(): boolean {
  return !!config.groqApiKey
}

export interface GroqCallOptions {
  /** Enable response_format: json_object for structured output. Default: false */
  jsonMode?: boolean
  /** Override max_tokens (default: 2048) */
  maxTokens?: number
}

export async function chatWithGroq(
  messages: ChatMessageInput[],
  options: GroqCallOptions = {},
): Promise<string> {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY not set')
  }

  const { jsonMode = false, maxTokens = 2048 } = options

  const body: Record<string, unknown> = {
    model: config.groqModel,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: false,
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  // Track rate limit headers on every response
  trackRateLimitHeaders(res)

  if (res.status === 429) {
    handleRateLimit(res)
    const text = await res.text()
    throw new Error(`Groq rate limited (429): ${text}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq API failed (${res.status}): ${text}`)
  }

  recordSuccess()

  const data = (await res.json()) as GroqResponse
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

/**
 * Streaming version — calls onChunk for each token.
 */
export async function chatWithGroqStream(
  messages: ChatMessageInput[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  options: GroqCallOptions = {},
): Promise<string> {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY not set')
  }

  const { jsonMode = false, maxTokens = 2048 } = options

  const body: Record<string, unknown> = {
    model: config.groqModel,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: true,
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(30_000),
  })

  // Track rate limit headers on every response
  trackRateLimitHeaders(res)

  if (res.status === 429) {
    handleRateLimit(res)
    const text = await res.text()
    throw new Error(`Groq rate limited (429): ${text}`)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq streaming failed (${res.status}): ${text}`)
  }

  recordSuccess()

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No readable stream from Groq')

  const decoder = new TextDecoder()
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (jsonStr === '[DONE]') continue
      if (!jsonStr) continue

      try {
        const parsed = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> }
        const token = parsed.choices?.[0]?.delta?.content ?? ''
        if (token) {
          accumulated += token
          onChunk(token)
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return accumulated
}
