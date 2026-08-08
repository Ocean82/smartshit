/**
 * AI Function Endpoint
 *
 * Handles requests from the client-side AI formula functions (=AI.CATEGORIZE, etc.)
 * Routes each function to the appropriate LLM prompt and returns a structured result.
 *
 * POST /api/ai-function
 * Body: { function: string, args: Record<string, unknown> }
 * Response: { result: string | number | null }
 */

import { Router } from 'express'
import { providerOrder, providerIsConfigured, callProvider } from '../providers.js'
import { requireAuth, getRequestUserId } from '../auth/clerk.js'
import { resolveIsPro } from '../plan.js'
import { checkUsage, recordUsage } from '../usage.js'
import { aiFunctionRateLimiter } from '../middleware/rateLimit.js'
import { validateBody } from '../middleware/validate.js'
import { aiFunctionBodySchema } from '../schemas/aiFunction.js'
import { forecast } from '../forecast.js'
import { score } from '../scoring.js'
import { validateLabel, parseAllowlist, parseSentiment } from '../labelValidation.js'
import { processBatch, estimateBatchCost, type BatchInput } from '../batch.js'

export const aiFunctionRouter = Router()

// Every route below is an LLM-backed, billable call. Without authentication
// this endpoint is an open inference proxy that bills the app owner, so the
// gate is applied at the router level rather than per-route.
aiFunctionRouter.use(requireAuth)

// ─── Experimental function burst protection ──────────────────────────────────
// AI.PREDICT.LLM is the deprecated LLM-based path (kept as escape hatch).
// Standard AI.PREDICT and AI.SCORE are now deterministic — no burst limits needed.
const LLM_EXPERIMENTAL_FUNCTIONS = new Set(['AI.PREDICT.LLM'])
const EXPERIMENTAL_BURST_LIMIT = 5
const experimentalBursts = new Map<string, { count: number; resetAt: number }>()

// ─── Deterministic functions are handled before this point (no LLM needed) ──

// ─── Types ───────────────────────────────────────────────────────────────────

interface AIFunctionRequest {
  function: string
  args: Record<string, unknown>
  /** Optional BYOK credentials so users can use their own API key */
  byok?: {
    apiKey: string
    baseUrl: string
    model?: string
    provider?: string
  }
}

interface AIFunctionResponse {
  result: string | number | null
  cached?: boolean
  /** Signals to the client that this function is experimental / LLM-based. */
  experimental?: boolean
  warning?: string
  /** Signals deterministic computation (no LLM involved). */
  deterministic?: boolean
  /** Method used for deterministic computation. */
  method?: string
  /** Confidence metric for deterministic computation. */
  confidence?: number
}

// ─── System prompts per function ─────────────────────────────────────────────

const FUNCTION_PROMPTS: Record<string, (args: Record<string, unknown>) => string> = {
  'AI.CATEGORIZE': (args) => {
    const categories = args.categories
      ? `Classify into one of these categories ONLY: ${args.categories}`
      : `Classify into a standard spending/income category (e.g., Food & Dining, Housing, Utilities, Transportation, Subscriptions, Shopping, Healthcare, Entertainment, Income, Savings, Insurance, Education, Travel, Gifts, Other).`
    return `You are a transaction categorization engine inside a spreadsheet.
${categories}
Return ONLY the category name, nothing else. No explanation, no quotes, no punctuation beyond what's in the category name.`
  },

  'AI.SENTIMENT': () =>
    `You are a sentiment analysis engine inside a spreadsheet.
Analyze the sentiment of the given text.
Return ONLY in this exact format: LABEL|CONFIDENCE
Where LABEL is one of: positive, negative, neutral
And CONFIDENCE is a decimal between 0 and 1 (e.g., 0.85).
Example: positive|0.92
No other text.`,

  'AI.SUMMARIZE': (args) => {
    const maxWords = args.maxWords ?? 50
    return `You are a text summarization engine inside a spreadsheet.
Summarize the following text in ${maxWords} words or fewer.
Return ONLY the summary text. No preamble, no "Summary:" prefix, no quotes.`
  },

  'AI.EXTRACT': (args) => {
    const field = String(args.field ?? 'date').toLowerCase()
    return `You are a data extraction engine inside a spreadsheet.
Extract the ${field} from the given text.
Return ONLY the extracted value with no extra text. If the ${field} cannot be found, return an empty string.
For dates: use YYYY-MM-DD format.
For amounts: return the numeric value only (no currency symbols).
For emails: return the full email address.
For phones: return in a standard format.
For names: return the full name.`
  },

  'AI.TRANSLATE': (args) => {
    const lang = String(args.language ?? 'English')
    return `You are a translation engine inside a spreadsheet.
Translate the given text to ${lang}.
Return ONLY the translated text. No quotes, no explanation, no "Translation:" prefix.`
  },

  'AI.CLASSIFY': (args) => {
    const labels = String(args.labels ?? '')
    return `You are a text classification engine inside a spreadsheet.
Classify the given text into exactly one of these labels: ${labels}
Return ONLY the label, nothing else. The label must match exactly one from the list above.`
  },

  'AI.TAG': (args) => {
    const maxTags = args.maxTags ?? 3
    return `You are an auto-tagging engine inside a spreadsheet.
Generate up to ${maxTags} relevant, concise tags for the given text.
Return ONLY the tags as a comma-separated list (e.g., "recurring, essential, monthly"). No explanation.`
  },

  'AI.EXPLAIN': () =>
    `You are an explanation engine inside a spreadsheet.
Provide a brief, plain-English explanation of the given value, formula, or transaction.
Keep it to 1-2 sentences. Be specific and useful. No preamble.`,

  'AI.PREDICT': (args) => {
    const periods = args.periods ?? 1
    return `You are a numeric prediction engine inside a spreadsheet.
Given the historical data values below, predict the next ${periods} value(s) using trend analysis.
Return ONLY a single number (the predicted value for the next period). No explanation, no units, just the number.
If predicting multiple periods, return only the final predicted value.
Round to 2 decimal places.`
  },

  'AI.SCORE': (args) => {
    const criteria = String(args.criteria ?? 'quality')
    return `You are a scoring engine inside a spreadsheet.
Score the given value from 0 to 100 based on: ${criteria}
Return ONLY a number between 0 and 100. No explanation, no units, just the integer.`
  },
}

// ─── Build the messages array for LLM ────────────────────────────────────────

function buildMessages(
  funcName: string,
  args: Record<string, unknown>,
): Array<{ role: 'system' | 'user'; content: string }> {
  const promptBuilder = FUNCTION_PROMPTS[funcName]
  if (!promptBuilder) {
    return [
      { role: 'system', content: 'You are a helpful assistant in a spreadsheet. Return only the requested value.' },
      { role: 'user', content: String(args.input ?? '') },
    ]
  }

  const systemPrompt = promptBuilder(args)
  let userContent: string

  if (funcName === 'AI.PREDICT') {
    const values = args.values
    userContent = Array.isArray(values)
      ? `Historical values: ${(values as number[]).join(', ')}`
      : String(args.input ?? '')
  } else {
    userContent = String(args.input ?? args.text ?? '')
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]
}

// ─── Parse LLM output into the expected type ─────────────────────────────────

function parseResult(funcName: string, raw: string): string | number | null {
  const trimmed = raw.trim()

  if (!trimmed) return null

  // Functions that should return numbers
  if (funcName === 'AI.PREDICT' || funcName === 'AI.SCORE') {
    // Extract first number from the response
    const numMatch = trimmed.match(/-?\d+(\.\d+)?/)
    if (numMatch) {
      const num = parseFloat(numMatch[0])
      if (!isNaN(num)) return num
    }
    return null
  }

  // All other functions return strings
  // Remove wrapping quotes if present
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

// ─── Route Handler ───────────────────────────────────────────────────────────

// Rate limiting is handled by the shared express-rate-limit middleware, which
// keys on the Clerk user id and falls back to an IPv6-safe address key.
// validateBody ensures Zod schema validation (including SSRF-hardened BYOK URLs)
// runs before the handler — invalid requests get a 400 with field-level errors.
aiFunctionRouter.post('/', aiFunctionRateLimiter, validateBody(aiFunctionBodySchema), async (req, res) => {
  const body = req.body as AIFunctionRequest

  const funcName = body.function.toUpperCase()

  // ─── Deterministic functions (AI.PREDICT, AI.SCORE) ─────────────────────
  // These use local math — no LLM, no API costs, no rate limits.
  if (funcName === 'AI.PREDICT') {
    const values = body.args.values
    if (!Array.isArray(values) || values.length === 0) {
      res.status(400).json({ error: 'AI.PREDICT requires a non-empty "values" array of numbers', result: null })
      return
    }
    const numericValues = (values as unknown[]).map(Number).filter((v) => !isNaN(v))
    if (numericValues.length === 0) {
      res.status(400).json({ error: 'AI.PREDICT requires numeric values', result: null })
      return
    }
    const periods = typeof body.args.periods === 'number' ? body.args.periods : 1
    const method = typeof body.args.method === 'string' ? body.args.method as 'linear' | 'moving_average' | 'seasonal_naive' : undefined
    const result = forecast(numericValues, { periods, method })
    res.json({ result: result.value, method: result.method, confidence: result.confidence, deterministic: true })
    return
  }

  if (funcName === 'AI.SCORE') {
    const input = body.args.input ?? body.args.value ?? body.args.text ?? ''
    const criteria = typeof body.args.criteria === 'string' ? body.args.criteria : 'quality'
    const distribution = Array.isArray(body.args.distribution)
      ? (body.args.distribution as unknown[]).map(Number).filter((v) => !isNaN(v))
      : undefined
    const mean = typeof body.args.mean === 'number' ? body.args.mean : undefined
    const stddev = typeof body.args.stddev === 'number' ? body.args.stddev : undefined
    const value = typeof input === 'number' ? input : String(input)
    const result = score(value, { criteria, distribution, mean, stddev })
    res.json({ result: result.score, method: result.method, deterministic: true })
    return
  }

  // ─── AI.PREDICT.LLM — Deprecated LLM-based path (escape hatch) ─────────
  // Users can explicitly call AI.PREDICT.LLM to get the old nondeterministic behavior.
  const effectiveFuncName = funcName === 'AI.PREDICT.LLM' ? 'AI.PREDICT' : funcName

  if (!FUNCTION_PROMPTS[effectiveFuncName]) {
    res.status(400).json({ error: `Unknown AI function: ${body.function}` })
    return
  }

  // ─── LLM experimental function burst protection ──────────────────────────
  if (LLM_EXPERIMENTAL_FUNCTIONS.has(funcName)) {
    const userId = getRequestUserId(req) ?? '__anon__'
    const now = Date.now()
    const burst = experimentalBursts.get(userId)
    if (burst && burst.resetAt > now) {
      if (burst.count >= EXPERIMENTAL_BURST_LIMIT) {
        res.status(429).json({
          error: `${funcName} is limited to ${EXPERIMENTAL_BURST_LIMIT} calls per minute. Use AI.PREDICT (deterministic) or FORECAST/TREND formulas for bulk predictions.`,
          result: null,
          experimental: true,
        })
        return
      }
      burst.count++
    } else {
      experimentalBursts.set(userId, { count: 1, resetAt: now + 60_000 })
    }
  }

  // Validate input isn't empty
  const input = String(body.args.input ?? body.args.text ?? body.args.values ?? '')
  if (!input.trim() && effectiveFuncName !== 'AI.PREDICT') {
    res.json({ result: '' } satisfies AIFunctionResponse)
    return
  }

  // ─── Usage gate (free tier enforcement) ────────────────────────────────────
  // BYOK callers pay for their own tokens, so they bypass the quota.
  const hasByok = Boolean(body.byok?.apiKey && body.byok?.baseUrl)
  const userId = getRequestUserId(req) ?? undefined
  const isPro = hasByok || (await resolveIsPro(userId))
  const usage = await checkUsage(userId, isPro)

  if (!usage.allowed) {
    res.status(429).json({
      error: `You've used all ${usage.limit} free AI requests for today. Upgrade to Pro for unlimited access.`,
      result: null,
    })
    return
  }

  // Build messages and call LLM
  const messages = buildMessages(effectiveFuncName, body.args)
  const availableProviders = providerOrder().filter(providerIsConfigured)

  if (availableProviders.length === 0 && !body.byok?.apiKey) {
    res.status(503).json({
      error: 'No AI providers available',
      result: null,
    })
    return
  }

  let rawResult: string | null = null
  let lastError: string | null = null

  // Try BYOK first if provided
  if (body.byok?.apiKey && body.byok?.baseUrl) {
    try {
      const { chatWithOpenAiCompatible } = await import('../openaiCompatible.js')
      rawResult = await chatWithOpenAiCompatible(
        { apiKey: body.byok.apiKey, model: body.byok.model ?? 'gpt-4o-mini', baseUrl: body.byok.baseUrl },
        messages,
      )
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      // Fall through to server providers
    }
  }

  // Fall back to server-configured providers
  if (rawResult === null) {
    for (const provider of availableProviders) {
      try {
        const response = await callProvider(provider, messages)
        rawResult = response.text
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`[ai-function] Provider ${provider} failed for ${effectiveFuncName}:`, lastError)
      }
    }
  }

  if (rawResult === null) {
    console.error(`[ai-function] All providers failed for ${funcName}:`, lastError)
    res.status(502).json({
      // Don't echo provider internals back to the client
      error: 'AI providers are currently unavailable. Please try again shortly.',
      result: null,
    })
    return
  }

  // Only count a request that actually consumed server-side inference
  if (!hasByok) await recordUsage(userId)

  const result = parseResult(effectiveFuncName, rawResult)
  const response: AIFunctionResponse = { result }

  // ─── Post-processing: Label validation for CATEGORIZE/CLASSIFY ───────────
  if ((effectiveFuncName === 'AI.CATEGORIZE' || effectiveFuncName === 'AI.CLASSIFY') && typeof result === 'string') {
    const allowlist = parseAllowlist(body.args.categories ?? body.args.labels)
    if (allowlist.length > 0) {
      const validated = validateLabel(result, allowlist)
      response.result = validated.label
      if (validated.warning) {
        response.warning = validated.warning
      }
    }
  }

  // ─── Post-processing: Sentiment with confidence ──────────────────────────
  if (effectiveFuncName === 'AI.SENTIMENT' && rawResult) {
    const sentiment = parseSentiment(rawResult)
    response.result = sentiment.label
    response.confidence = sentiment.confidence
  }

  if (LLM_EXPERIMENTAL_FUNCTIONS.has(funcName)) {
    response.experimental = true
    response.warning = `${funcName} uses AI estimation — results are non-deterministic. Consider using AI.PREDICT (deterministic) instead.`
  }

  res.json(response)
})

// ─── Batch Endpoint ──────────────────────────────────────────────────────────
// POST /api/ai-function/batch
// Processes multiple AI function inputs in optimized batches.
// Deduplicates identical inputs, caches results, and coalesces LLM calls.

aiFunctionRouter.post('/batch', aiFunctionRateLimiter, async (req, res) => {
  const body = req.body as { inputs?: unknown[] }

  if (!Array.isArray(body.inputs) || body.inputs.length === 0) {
    res.status(400).json({ error: 'Request body must contain a non-empty "inputs" array' })
    return
  }

  if (body.inputs.length > 100) {
    res.status(400).json({ error: 'Maximum 100 inputs per batch request' })
    return
  }

  // Validate each input
  const inputs: BatchInput[] = []
  for (let i = 0; i < body.inputs.length; i++) {
    const item = body.inputs[i] as Record<string, unknown> | null
    if (!item || typeof item !== 'object') {
      res.status(400).json({ error: `inputs[${i}] must be an object` })
      return
    }
    if (!item.id || typeof item.id !== 'string') {
      res.status(400).json({ error: `inputs[${i}].id is required and must be a string` })
      return
    }
    if (!item.function || typeof item.function !== 'string') {
      res.status(400).json({ error: `inputs[${i}].function is required and must be a string` })
      return
    }
    inputs.push({
      id: item.id,
      function: String(item.function),
      args: (item.args && typeof item.args === 'object' ? item.args : {}) as Record<string, unknown>,
    })
  }

  // Usage gate
  const userId = getRequestUserId(req) ?? undefined
  const isPro = await resolveIsPro(userId)
  const usage = await checkUsage(userId, isPro)
  if (!usage.allowed) {
    res.status(429).json({
      error: `You've used all ${usage.limit} free AI requests for today. Upgrade to Pro for unlimited access.`,
    })
    return
  }

  try {
    const response = await processBatch(inputs)

    // Count each LLM call for usage tracking (cached results are free).
    // This ensures free-tier users are billed per actual inference, not per batch request.
    for (let i = 0; i < response.llmCalls; i++) {
      await recordUsage(userId)
    }

    res.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ai-function/batch] Error:', message)
    res.status(502).json({ error: 'Batch processing failed. Please try again.' })
  }
})

// ─── Cost Estimate Endpoint ──────────────────────────────────────────────────
// POST /api/ai-function/estimate
// Returns an estimate of how many LLM calls a batch would require.

aiFunctionRouter.post('/estimate', async (req, res) => {
  const body = req.body as { inputs?: unknown[] }

  if (!Array.isArray(body.inputs) || body.inputs.length === 0) {
    res.json({ uniqueInputs: 0, estimatedCalls: 0, cachedCount: 0 })
    return
  }

  const inputs: BatchInput[] = body.inputs
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      function: String(item.function ?? ''),
      args: (item.args && typeof item.args === 'object' ? item.args : {}) as Record<string, unknown>,
    }))

  const estimate = estimateBatchCost(inputs)
  res.json(estimate)
})
