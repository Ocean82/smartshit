/**
 * Batch Processing for AI Formula Fill-Down
 *
 * When a user fills down AI.CATEGORIZE (or similar) across many cells,
 * this module coalesces multiple inputs into single LLM calls:
 *
 * 1. Deduplicates identical inputs (cache key = function + JSON.stringify(args))
 * 2. Groups remaining into batches of ≤10 inputs
 * 3. Builds a single prompt for multiple items
 * 4. Parses the array response, maps back to individual cells
 * 5. Caches results for the session (TTL: 5 minutes)
 */

import { callProviderWithFailover } from './providers.js'
import type { ChatMessageInput } from './prompt.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BatchInput {
  /** Unique identifier for this cell/request */
  id: string
  /** The AI function to call (e.g., "AI.CATEGORIZE") */
  function: string
  /** Arguments for the function */
  args: Record<string, unknown>
}

export interface BatchResult {
  id: string
  result: string | number | null
  cached: boolean
  error?: string
}

export interface BatchResponse {
  results: BatchResult[]
  /** Provider that handled the batch */
  provider?: string
  /** Model used */
  model?: string
  /** Total unique inputs processed (before dedup) */
  uniqueInputs: number
  /** Number of LLM calls made */
  llmCalls: number
}

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: string | number | null
  expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, CacheEntry>()

function cacheKey(func: string, args: Record<string, unknown>): string {
  return `${func}:${JSON.stringify(args)}`
}

function getCached(func: string, args: Record<string, unknown>): string | number | null | undefined {
  const key = cacheKey(func, args)
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return undefined
  }
  return entry.result
}

function setCache(func: string, args: Record<string, unknown>, result: string | number | null): void {
  const key = cacheKey(func, args)
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Clear expired entries. Called periodically. */
function pruneCache(): void {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) cache.delete(key)
  }
}

// Prune every 60 seconds. unref() so the timer never holds the process open.
const pruneTimer = setInterval(pruneCache, 60_000)
pruneTimer.unref?.()

// ─── Batch Execution ─────────────────────────────────────────────────────────

const MAX_BATCH_SIZE = 10

/**
 * Process a batch of AI function requests efficiently.
 * Deduplicates, batches, and caches results.
 */
export async function processBatch(inputs: BatchInput[]): Promise<BatchResponse> {
  const results: BatchResult[] = []
  const uncachedInputs: Array<{ input: BatchInput; key: string }> = []

  // Step 1: Check cache for each input
  for (const input of inputs) {
    const cached = getCached(input.function, input.args)
    if (cached !== undefined) {
      results.push({ id: input.id, result: cached, cached: true })
    } else {
      uncachedInputs.push({ input, key: cacheKey(input.function, input.args) })
    }
  }

  // Step 2: Deduplicate uncached inputs
  const uniqueMap = new Map<string, { input: BatchInput; ids: string[] }>()
  for (const { input, key } of uncachedInputs) {
    const existing = uniqueMap.get(key)
    if (existing) {
      existing.ids.push(input.id)
    } else {
      uniqueMap.set(key, { input, ids: [input.id] })
    }
  }

  const uniqueInputs = [...uniqueMap.values()]
  let llmCalls = 0
  let lastProvider: string | undefined
  let lastModel: string | undefined

  // Step 3: Group by function type (batches must be homogeneous)
  const byFunction = new Map<string, Array<{ input: BatchInput; ids: string[] }>>()
  for (const entry of uniqueInputs) {
    const func = entry.input.function.toUpperCase()
    const group = byFunction.get(func) ?? []
    group.push(entry)
    byFunction.set(func, group)
  }

  // Step 4: Process each function group in batches
  for (const [, groupEntries] of byFunction) {
    for (let i = 0; i < groupEntries.length; i += MAX_BATCH_SIZE) {
      const batch = groupEntries.slice(i, i + MAX_BATCH_SIZE)
      llmCalls++

      try {
        const batchResults = await executeBatch(batch.map((b) => b.input))
        lastProvider = batchResults.provider
        lastModel = batchResults.model

        // Map results back to individual IDs and cache
        for (let j = 0; j < batch.length; j++) {
          const { input, ids } = batch[j]
          const result = batchResults.results[j] ?? null

          // Cache the result
          setCache(input.function, input.args, result)

          // Map to all IDs that share this input
          for (const id of ids) {
            results.push({ id, result, cached: false })
          }
        }
      } catch (err) {
        // On batch failure, mark all items in this batch as errored
        const errorMsg = err instanceof Error ? err.message : String(err)
        for (const { ids } of batch) {
          for (const id of ids) {
            results.push({ id, result: null, cached: false, error: errorMsg })
          }
        }
      }
    }
  }

  return {
    results,
    provider: lastProvider,
    model: lastModel,
    uniqueInputs: uniqueMap.size,
    llmCalls,
  }
}

// ─── Internal: Execute a single batch via LLM ────────────────────────────────

interface BatchExecResult {
  results: Array<string | number | null>
  provider?: string
  model?: string
}

async function executeBatch(inputs: BatchInput[]): Promise<BatchExecResult> {
  if (inputs.length === 0) return { results: [] }

  // All inputs should be the same function for optimal batching
  const funcName = inputs[0].function.toUpperCase()

  const systemPrompt = buildBatchSystemPrompt(funcName, inputs[0].args)
  const userContent = buildBatchUserContent(funcName, inputs)

  const messages: ChatMessageInput[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

  const response = await callProviderWithFailover(messages, {
    jsonMode: true,
    maxTokens: 2048,
  })

  // Parse the JSON array response
  const parsed = parseBatchResponse(response.text, inputs.length)

  return {
    results: parsed,
    provider: response.meta.provider,
    model: response.meta.model,
  }
}

function buildBatchSystemPrompt(funcName: string, sampleArgs: Record<string, unknown>): string {
  const base = getBatchFunctionDescription(funcName, sampleArgs)
  return `${base}

You will receive multiple inputs to process. Return a JSON object with a "results" array containing one result per input, in the same order.
Each result should be a string (for text functions) or number (for numeric functions).
Example response format: {"results": ["result1", "result2", "result3"]}`
}

function getBatchFunctionDescription(funcName: string, args: Record<string, unknown>): string {
  switch (funcName) {
    case 'AI.CATEGORIZE': {
      const categories = args.categories
        ? `Classify each into one of these categories ONLY: ${args.categories}`
        : `Classify each into a standard category.`
      return `You are a categorization engine. ${categories}`
    }
    case 'AI.SENTIMENT':
      return `You are a sentiment analysis engine. For each text, determine if it is "positive", "negative", or "neutral".`
    case 'AI.SUMMARIZE':
      return `You are a summarization engine. Summarize each text briefly.`
    case 'AI.EXTRACT': {
      const field = String(args.field ?? 'value')
      return `You are a data extraction engine. Extract the ${field} from each text.`
    }
    case 'AI.TRANSLATE': {
      const lang = String(args.language ?? 'English')
      return `You are a translation engine. Translate each text to ${lang}.`
    }
    case 'AI.CLASSIFY': {
      const labels = String(args.labels ?? '')
      return `You are a classification engine. Classify each text into one of: ${labels}`
    }
    case 'AI.TAG':
      return `You are a tagging engine. Generate relevant tags for each text.`
    default:
      return `You are a helpful assistant. Process each input.`
  }
}

function buildBatchUserContent(funcName: string, inputs: BatchInput[]): string {
  const items = inputs.map((input, i) => {
    const text = String(input.args.input ?? input.args.text ?? '')
    return `${i + 1}. ${text}`
  })
  return `Process these ${inputs.length} items:\n\n${items.join('\n')}`
}

function parseBatchResponse(raw: string, expectedCount: number): Array<string | number | null> {
  try {
    const parsed = JSON.parse(raw)

    // Handle { results: [...] } format
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.results)) {
      return padResults(parsed.results, expectedCount)
    }

    // Handle direct array
    if (Array.isArray(parsed)) {
      return padResults(parsed, expectedCount)
    }

    // Single value — replicate for all
    return new Array(expectedCount).fill(typeof parsed === 'string' || typeof parsed === 'number' ? parsed : null)
  } catch {
    // Non-JSON response — try to split by lines
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length >= expectedCount) {
      return lines.slice(0, expectedCount)
    }
    return new Array(expectedCount).fill(null)
  }
}

function padResults(arr: unknown[], expectedCount: number): Array<string | number | null> {
  const results: Array<string | number | null> = []
  for (let i = 0; i < expectedCount; i++) {
    const val = arr[i]
    if (typeof val === 'string' || typeof val === 'number') {
      results.push(val)
    } else if (val === null || val === undefined) {
      results.push(null)
    } else {
      results.push(String(val))
    }
  }
  return results
}

/** Exposed for testing — clear the entire cache. */
export function clearBatchCache(): void {
  cache.clear()
}

/**
 * Get a cost estimate for a batch operation.
 * Returns approximate token count and estimated cost.
 */
export function estimateBatchCost(inputs: BatchInput[]): { uniqueInputs: number; estimatedCalls: number; cachedCount: number } {
  let cachedCount = 0
  const seen = new Set<string>()

  for (const input of inputs) {
    const key = cacheKey(input.function, input.args)
    if (getCached(input.function, input.args) !== undefined) {
      cachedCount++
    } else {
      seen.add(key)
    }
  }

  const uniqueInputs = seen.size
  const estimatedCalls = Math.ceil(uniqueInputs / MAX_BATCH_SIZE)

  return { uniqueInputs, estimatedCalls, cachedCount }
}
