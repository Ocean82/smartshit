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
import { config } from '../config.js'
import { providerOrder, providerIsConfigured, callProvider } from '../providers.js'

export const aiFunctionRouter = Router()

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

// ─── Rate limiting (simple in-memory) ────────────────────────────────────────

const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 30 // 30 AI function calls per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimiter.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) return false

  entry.count++
  return true
}

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimiter) {
    if (now > entry.resetAt) rateLimiter.delete(key)
  }
}, 60_000)

// ─── Route Handler ───────────────────────────────────────────────────────────

aiFunctionRouter.post('/', async (req, res) => {
  const body = req.body as AIFunctionRequest

  // Validate request
  if (!body.function || !body.args) {
    res.status(400).json({ error: 'function and args are required' })
    return
  }

  const funcName = body.function.toUpperCase()
  if (!FUNCTION_PROMPTS[funcName]) {
    res.status(400).json({ error: `Unknown AI function: ${body.function}` })
    return
  }

  // Rate limit
  const clientIp = (req.ip || req.socket.remoteAddress || 'unknown')
  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      error: 'Rate limit exceeded. Maximum 30 AI function calls per minute.',
      result: null,
    })
    return
  }

  // Validate input isn't empty
  const input = String(body.args.input ?? body.args.text ?? body.args.values ?? '')
  if (!input.trim() && funcName !== 'AI.PREDICT') {
    res.json({ result: '' } satisfies AIFunctionResponse)
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
    res.status(502).json({
      error: `AI providers failed: ${lastError ?? 'unknown error'}`,
      result: null,
    })
    return
  }

  const result = parseResult(funcName, rawResult)
  res.json({ result } satisfies AIFunctionResponse)
})
