import type { UserIntent } from '../../shared/intentTypes.js'
import { config } from './config.js'
import { callProvider, providerIsConfigured, providerOrder } from './providers.js'
import { parseUserIntent as keywordParseUserIntent } from './intentParser.js'

/** Timeout (ms) for the LLM intent-parsing call. */
const INTENT_PARSE_TIMEOUT_MS = 10_000

const SYSTEM_PROMPT = `You are an AI assistant that extracts user intent for spreadsheet operations.
Given a user message and conversation history, return a JSON object with:

Possible intent types: read, analyze, write, format, create_chart, create_formula, summarize, filter, sort, clean, budget, report, compare, find, calculate, export, chat, unknown.

When the user uses pronouns ("it", "that column") referring to something from conversation history, resolve the reference.

Return ONLY valid JSON with these fields:
- intentType: string (one of the types above)
- targetSheet: string | null
- targetColumns: string[]
- targetRows: string | null
- filters: object (key-value filtering conditions)
- parameters: object (additional params like {ascending: true}, {chartType: "bar"})
- rawQuery: string (the original message)
- confidence: number (0.0 to 1.0)

Example: "Show me the top 5 expenses in the Budget sheet"
{"intentType":"filter","targetSheet":"Budget","targetColumns":["expenses"],"targetRows":null,"filters":{},"parameters":{"n":5,"position":"top"},"rawQuery":"Show me the top 5 expenses in the Budget sheet","confidence":0.95}`

/**
 * Hybrid intent parser: uses the fast keyword parser first, then escalates to
 * LLM only when keyword confidence is below the threshold. This avoids adding
 * latency for clearly-classifiable messages.
 */
export async function parseIntentWithLlm(
  userMessage: string,
  history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [],
): Promise<UserIntent> {
  // Step 1: Try keyword parser first — it's instant
  const keywordResult = keywordParseUserIntent(userMessage)

  // If keyword parser is confident enough, skip the LLM call entirely
  if (keywordResult.confidence >= config.intentConfidenceThreshold) {
    return keywordResult
  }

  // Step 2: Keyword confidence is low — escalate to LLM for better understanding
  const availableProviders = providerOrder().filter(providerIsConfigured)
  if (availableProviders.length === 0) {
    // No LLM available, return keyword result as-is
    return keywordResult
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-4),
    { role: 'user', content: userMessage },
  ]

  // Use AbortController for timeout protection
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), INTENT_PARSE_TIMEOUT_MS)

  let llmResponse = ''
  let usedProvider: string | null = null

  try {
    for (const provider of availableProviders) {
      if (abortController.signal.aborted) break
      try {
        llmResponse = await callProvider(provider, messages)
        usedProvider = provider
        break
      } catch (error) {
        if (abortController.signal.aborted) break
        // Continue to next provider
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  if (!usedProvider) {
    // LLM call failed or timed out — return keyword result
    return keywordResult
  }

  try {
    // Strip markdown code fences if the LLM wraps its response
    const cleaned = llmResponse
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim()

    const parsedIntent = JSON.parse(cleaned)

    if (
      typeof parsedIntent.intentType === 'string' &&
      typeof parsedIntent.rawQuery === 'string' &&
      typeof parsedIntent.confidence === 'number' &&
      Array.isArray(parsedIntent.targetColumns) &&
      typeof parsedIntent.filters === 'object' &&
      typeof parsedIntent.parameters === 'object'
    ) {
      return parsedIntent as UserIntent
    }

    // Malformed structure — fall back
    return keywordResult
  } catch {
    // JSON parse failed — fall back
    return keywordResult
  }
}
