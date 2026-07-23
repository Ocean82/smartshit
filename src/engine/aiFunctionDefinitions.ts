/**
 * Built-in AI Function Definitions
 *
 * Registers the default set of AI-powered formula functions.
 * These functions call the smartsht AI backend to process cell values
 * through an LLM and return structured results.
 *
 * Usage in cells:
 *   =AI.CATEGORIZE(A1)           → "Food & Dining"
 *   =AI.SENTIMENT(B2)            → "positive"
 *   =AI.SUMMARIZE(A1:A10)        → "Monthly expenses totaling $2,450..."
 *   =AI.EXTRACT(A1, "date")      → "2024-03-15"
 *   =AI.TRANSLATE(A1, "es")      → "Hola mundo"
 *   =AI.CLASSIFY(A1, "high,medium,low") → "high"
 *   =AI.TAG(A1)                  → "recurring, essential"
 *   =AI.EXPLAIN(A1)              → "This is a monthly subscription..."
 */

import type { AIFunctionInfo, AsyncAIFunctionExecutor } from './aiFunctions'
import { aiFunctionRegistry } from './aiFunctions'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

// ─── Helper: Call the AI backend ──────────────────────────────────────────────

async function callAIFunction(
  functionName: string,
  args: Record<string, unknown>,
): Promise<string | number | null> {
  try {
    const { getByokPayload } = await import('@/lib/userApiKey')
    const byok = getByokPayload()
    // Use the /api/ai-function endpoint
    const res = await fetch(`${API_BASE}/api/ai-function`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ function: functionName, args, byok }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      // Fallback: try local processing if server is unavailable
      return localFallback(functionName, args)
    }

    const data = (await res.json()) as { result: string | number | null }
    return data.result
  } catch {
    // Server unavailable — use local fallback
    return localFallback(functionName, args)
  }
}

/**
 * Local fallback for when the AI server is offline.
 * Provides basic heuristic results without LLM.
 */
function localFallback(
  functionName: string,
  args: Record<string, unknown>,
): string | number | null {
  const input = String(args.input ?? args.text ?? '')

  switch (functionName) {
    case 'AI.CATEGORIZE':
      return heuristicCategorize(input)
    case 'AI.SENTIMENT':
      return heuristicSentiment(input)
    case 'AI.EXTRACT':
      return heuristicExtract(input, String(args.field ?? ''))
    default:
      return `[AI offline] ${input.slice(0, 50)}`
  }
}

function heuristicCategorize(text: string): string {
  const lower = text.toLowerCase()
  const categories: [string[], string][] = [
    [['grocery', 'food', 'restaurant', 'dining', 'cafe', 'coffee', 'lunch', 'dinner', 'breakfast', 'uber eats', 'doordash'], 'Food & Dining'],
    [['rent', 'mortgage', 'housing', 'apartment'], 'Housing'],
    [['electric', 'gas', 'water', 'internet', 'phone', 'utility', 'utilities'], 'Utilities'],
    [['uber', 'lyft', 'gas station', 'fuel', 'parking', 'transit', 'bus', 'train', 'metro'], 'Transportation'],
    [['netflix', 'spotify', 'hulu', 'disney', 'subscription', 'membership', 'gym'], 'Subscriptions'],
    [['amazon', 'walmart', 'target', 'shopping', 'store', 'purchase'], 'Shopping'],
    [['doctor', 'pharmacy', 'hospital', 'medical', 'health', 'dental', 'insurance'], 'Healthcare'],
    [['salary', 'paycheck', 'income', 'deposit', 'transfer in', 'payment received'], 'Income'],
    [['entertainment', 'movie', 'concert', 'game', 'ticket', 'bar'], 'Entertainment'],
  ]

  for (const [keywords, category] of categories) {
    if (keywords.some((kw) => lower.includes(kw))) return category
  }
  return 'Other'
}

function heuristicSentiment(text: string): string {
  const lower = text.toLowerCase()
  const positive = ['good', 'great', 'excellent', 'love', 'happy', 'wonderful', 'fantastic', 'amazing', 'profit', 'gain', 'increase', 'growth']
  const negative = ['bad', 'terrible', 'awful', 'hate', 'sad', 'horrible', 'loss', 'decrease', 'decline', 'debt', 'overdue', 'late']

  const posScore = positive.filter((w) => lower.includes(w)).length
  const negScore = negative.filter((w) => lower.includes(w)).length

  if (posScore > negScore) return 'positive'
  if (negScore > posScore) return 'negative'
  return 'neutral'
}

function heuristicExtract(text: string, field: string): string {
  const lower = field.toLowerCase()
  if (lower === 'date' || lower === 'dates') {
    const dateMatch = text.match(/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}/)
    return dateMatch?.[0] ?? ''
  }
  if (lower === 'number' || lower === 'amount') {
    const numMatch = text.match(/[\d,]+\.?\d*/)
    return numMatch?.[0]?.replace(/,/g, '') ?? ''
  }
  if (lower === 'email') {
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/)
    return emailMatch?.[0] ?? ''
  }
  if (lower === 'phone') {
    const phoneMatch = text.match(/[\d()+-][\d() +-]{6,}/)
    return phoneMatch?.[0] ?? ''
  }
  return ''
}

// ─── Function Definitions ──────────────────────────────────────────────────────

const AI_CATEGORIZE: AIFunctionInfo = {
  name: 'AI.CATEGORIZE',
  description: 'Categorizes a transaction or text into a spending/income category using AI',
  abstract: 'AI-powered expense categorization',
  category: 'AI/Finance',
  syntax: 'AI.CATEGORIZE(text, [categories])',
  parameters: [
    { name: 'text', description: 'The text to categorize (e.g., a transaction description)', required: true, type: 'string', example: '"Starbucks Coffee"' },
    { name: 'categories', description: 'Optional comma-separated list of custom categories', required: false, type: 'string', example: '"Food,Transport,Bills"' },
  ],
  isAsync: true,
}

const AI_SENTIMENT: AIFunctionInfo = {
  name: 'AI.SENTIMENT',
  description: 'Analyzes the sentiment of text and returns positive, negative, or neutral',
  abstract: 'AI sentiment analysis',
  category: 'AI/Text',
  syntax: 'AI.SENTIMENT(text)',
  parameters: [
    { name: 'text', description: 'The text to analyze', required: true, type: 'string', example: '"Great service, will return!"' },
  ],
  isAsync: true,
}

const AI_SUMMARIZE: AIFunctionInfo = {
  name: 'AI.SUMMARIZE',
  description: 'Summarizes a range of text values into a concise description',
  abstract: 'AI text summarization',
  category: 'AI/Text',
  syntax: 'AI.SUMMARIZE(range, [max_words])',
  parameters: [
    { name: 'range', description: 'A range of cells or text to summarize', required: true, type: 'range', example: 'A1:A10' },
    { name: 'max_words', description: 'Maximum words in the summary (default: 50)', required: false, type: 'number', example: '30' },
  ],
  isAsync: true,
}

const AI_EXTRACT: AIFunctionInfo = {
  name: 'AI.EXTRACT',
  description: 'Extracts a specific piece of information from text (date, amount, email, phone, name)',
  abstract: 'AI data extraction from text',
  category: 'AI/Text',
  syntax: 'AI.EXTRACT(text, field)',
  parameters: [
    { name: 'text', description: 'The text to extract from', required: true, type: 'string', example: '"Invoice #123 due 03/15/2024 for $500"' },
    { name: 'field', description: 'What to extract: "date", "amount", "email", "phone", "name"', required: true, type: 'string', example: '"date"' },
  ],
  isAsync: true,
}

const AI_TRANSLATE: AIFunctionInfo = {
  name: 'AI.TRANSLATE',
  description: 'Translates text to a target language',
  abstract: 'AI translation',
  category: 'AI/Text',
  syntax: 'AI.TRANSLATE(text, language)',
  parameters: [
    { name: 'text', description: 'The text to translate', required: true, type: 'string', example: '"Hello world"' },
    { name: 'language', description: 'Target language code or name (e.g., "es", "Spanish", "fr")', required: true, type: 'string', example: '"es"' },
  ],
  isAsync: true,
}

const AI_CLASSIFY: AIFunctionInfo = {
  name: 'AI.CLASSIFY',
  description: 'Classifies text into one of the provided labels',
  abstract: 'AI multi-class classification',
  category: 'AI',
  syntax: 'AI.CLASSIFY(text, labels)',
  parameters: [
    { name: 'text', description: 'The text to classify', required: true, type: 'string', example: '"The server is down and users cannot login"' },
    { name: 'labels', description: 'Comma-separated list of possible labels', required: true, type: 'string', example: '"bug,feature,question"' },
  ],
  isAsync: true,
}

const AI_TAG: AIFunctionInfo = {
  name: 'AI.TAG',
  description: 'Generates relevant tags for the given text',
  abstract: 'AI auto-tagging',
  category: 'AI/Text',
  syntax: 'AI.TAG(text, [max_tags])',
  parameters: [
    { name: 'text', description: 'The text to tag', required: true, type: 'string', example: '"Monthly gym membership payment"' },
    { name: 'max_tags', description: 'Maximum number of tags (default: 3)', required: false, type: 'number', example: '5' },
  ],
  isAsync: true,
}

const AI_EXPLAIN: AIFunctionInfo = {
  name: 'AI.EXPLAIN',
  description: 'Provides a plain-English explanation of a value, formula, or transaction',
  abstract: 'AI explanation generator',
  category: 'AI',
  syntax: 'AI.EXPLAIN(value)',
  parameters: [
    { name: 'value', description: 'The value or text to explain', required: true, type: 'any', example: '"=VLOOKUP(A1,B:C,2,FALSE)"' },
  ],
  isAsync: true,
}

const AI_PREDICT: AIFunctionInfo = {
  name: 'AI.PREDICT',
  description: 'Predicts the next value based on a range of historical data',
  abstract: 'AI-powered value prediction',
  category: 'AI/Analysis',
  syntax: 'AI.PREDICT(range, [periods])',
  parameters: [
    { name: 'range', description: 'Historical values to base prediction on', required: true, type: 'range', example: 'B2:B12' },
    { name: 'periods', description: 'Number of periods ahead to predict (default: 1)', required: false, type: 'number', example: '3' },
  ],
  isAsync: true,
}

const AI_SCORE: AIFunctionInfo = {
  name: 'AI.SCORE',
  description: 'Scores a value from 0 to 100 based on specified criteria',
  abstract: 'AI scoring/rating',
  category: 'AI/Analysis',
  syntax: 'AI.SCORE(value, criteria)',
  parameters: [
    { name: 'value', description: 'The value to score', required: true, type: 'any', example: '"Premium plan, 24/7 support, unlimited storage"' },
    { name: 'criteria', description: 'What to score against (e.g., "value for money", "urgency", "risk")', required: true, type: 'string', example: '"value for money"' },
  ],
  isAsync: true,
}

// ─── Executor Implementations ──────────────────────────────────────────────────

const categorizeExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const text = String(args[0] ?? '')
  const categories = args[1] ? String(args[1]) : undefined
  if (!text.trim()) return ''
  return await callAIFunction('AI.CATEGORIZE', { input: text, categories })
}

const sentimentExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const text = String(args[0] ?? '')
  if (!text.trim()) return ''
  return await callAIFunction('AI.SENTIMENT', { input: text })
}

const summarizeExecutor: AsyncAIFunctionExecutor = async (...args) => {
  // args[0] can be a 2D array (range) or a string
  let text: string
  if (Array.isArray(args[0])) {
    const flat = (args[0] as (string | number | boolean | null)[][])
      .flat()
      .filter((v) => v !== null && v !== '')
      .map(String)
    text = flat.join('; ')
  } else {
    text = String(args[0] ?? '')
  }
  const maxWords = args[1] ? Number(args[1]) : 50
  if (!text.trim()) return ''
  return await callAIFunction('AI.SUMMARIZE', { input: text, maxWords })
}

const extractExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const text = String(args[0] ?? '')
  const field = String(args[1] ?? 'date')
  if (!text.trim()) return ''
  return await callAIFunction('AI.EXTRACT', { input: text, field })
}

const translateExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const text = String(args[0] ?? '')
  const language = String(args[1] ?? 'en')
  if (!text.trim()) return ''
  return await callAIFunction('AI.TRANSLATE', { input: text, language })
}

const classifyExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const text = String(args[0] ?? '')
  const labels = String(args[1] ?? '')
  if (!text.trim() || !labels.trim()) return ''
  return await callAIFunction('AI.CLASSIFY', { input: text, labels })
}

const tagExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const text = String(args[0] ?? '')
  const maxTags = args[1] ? Number(args[1]) : 3
  if (!text.trim()) return ''
  return await callAIFunction('AI.TAG', { input: text, maxTags })
}

const explainExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const value = String(args[0] ?? '')
  if (!value.trim()) return ''
  return await callAIFunction('AI.EXPLAIN', { input: value })
}

const predictExecutor: AsyncAIFunctionExecutor = async (...args) => {
  let values: number[]
  if (Array.isArray(args[0])) {
    values = (args[0] as (string | number | boolean | null)[][])
      .flat()
      .map(Number)
      .filter((n) => !isNaN(n))
  } else {
    values = [Number(args[0])].filter((n) => !isNaN(n))
  }
  const periods = args[1] ? Number(args[1]) : 1

  // Simple local linear regression fallback for numeric prediction
  if (values.length < 2) return '#NEED_DATA'

  // Try server first
  const result = await callAIFunction('AI.PREDICT', { values, periods })
  if (result !== null) return result

  // Local fallback: simple linear extrapolation
  const n = values.length
  const sumX = (n * (n - 1)) / 2
  const sumY = values.reduce((a, b) => a + b, 0)
  const sumXY = values.reduce((sum, y, i) => sum + i * y, 0)
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n
  const prediction = slope * (n - 1 + periods) + intercept
  return Math.round(prediction * 100) / 100
}

const scoreExecutor: AsyncAIFunctionExecutor = async (...args) => {
  const value = String(args[0] ?? '')
  const criteria = String(args[1] ?? '')
  if (!value.trim() || !criteria.trim()) return ''
  return await callAIFunction('AI.SCORE', { input: value, criteria })
}

// ─── Registration ──────────────────────────────────────────────────────────────

/**
 * Register all built-in AI functions into the registry.
 * Returns a dispose function that unregisters everything.
 */
export function registerBuiltinAIFunctions(): () => void {
  const disposers = [
    aiFunctionRegistry.registerAsyncFunction(AI_CATEGORIZE, categorizeExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_SENTIMENT, sentimentExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_SUMMARIZE, summarizeExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_EXTRACT, extractExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_TRANSLATE, translateExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_CLASSIFY, classifyExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_TAG, tagExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_EXPLAIN, explainExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_PREDICT, predictExecutor),
    aiFunctionRegistry.registerAsyncFunction(AI_SCORE, scoreExecutor),
  ]

  return () => {
    disposers.forEach((dispose) => dispose())
  }
}

/** Get all AI function infos formatted for the autocomplete component */
export function getAIFunctionList(): Array<{
  name: string
  description: string
  category: string
  syntax: string
}> {
  return aiFunctionRegistry.getAllFunctions().map((info) => ({
    name: info.name,
    description: info.abstract,
    category: info.category,
    syntax: info.syntax,
  }))
}
