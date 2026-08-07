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

export const aiFunctionRouter = Router()

// Every route below is an LLM-backed, billable call. Without authentication
// this endpoint is an open inference proxy that bills the app owner, so the
// gate is applied at the router level rather than per-route.
aiFunctionRouter.use(requireAuth)

// ─── Experimental function burst protection ──────────────────────────────────
// AI.PREDICT and AI.SCORE use an LLM for numeric output, which is inherently
// nondeterministic and expensive. Limit burst calls (e.g., fill-down) per user.
const EXPERIMENTAL_FUNCTIONS = new Set(['AI.PREDICT', 'AI.SCORE'])
const EXPERIMENTAL_BURST_LIMIT = 5
const experimentalBursts = new Map<string, { count: number; resetAt: number }>()

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
Return ONLY one word: "positive", "negative", or "neutral". Nothing else.`,

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
  if (!FUNCTION_PROMPTS[funcName]) {
    res.status(400).json({ error: `Unknown AI function: ${body.function}` })
    return
  }

  // ─── Experimental function burst protection ──────────────────────────────
  // Prevents fill-down from generating dozens of expensive LLM calls.
  if (EXPERIMENTAL_FUNCTIONS.has(funcName)) {
    const userId = getRequestUserId(req) ?? '__anon__'
    const now = Date.now()
    const burst = experimentalBursts.get(userId)
    if (burst && burst.resetAt > now) {
      if (burst.count >= EXPERIMENTAL_BURST_LIMIT) {
        res.status(429).json({
          error: `${funcName} is limited to ${EXPERIMENTAL_BURST_LIMIT} calls per minute. Use deterministic formulas (FORECAST, TREND) for bulk predictions.`,
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
  if (!input.trim() && funcName !== 'AI.PREDICT') {
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
  const messages = buildMessages(funcName, body.args)
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
        rawResult = await callProvider(provider, messages)
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.warn(`[ai-function] Provider ${provider} failed for ${funcName}:`, lastError)
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

  const result = parseResult(funcName, rawResult)
  const response: AIFunctionResponse = { result }

  if (EXPERIMENTAL_FUNCTIONS.has(funcName)) {
    response.experimental = true
    response.warning = `${funcName} uses AI estimation — results are non-deterministic and should not be used for financial decisions.`
  }

  res.json(response)
})
