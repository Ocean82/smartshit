/**
 * Structured Output Validation Layer
 *
 * Wraps provider calls with Zod schema validation for reliable JSON output.
 * - Calls provider with jsonMode enabled
 * - Parses response as JSON
 * - Validates against provided Zod schema
 * - Retries once on failure with error hint appended to prompt
 * - Throws StructuredOutputError if validation fails after retry
 *
 * Use for all tool/act mode calls where structured responses are required.
 */

import { z } from 'zod'
import { callProviderWithFailover, type ProviderCallOptions, type ProviderMeta } from './providers.js'
import type { ChatMessageInput } from './prompt.js'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidatedResponse<T> {
  data: T
  meta: ProviderMeta
  retried: boolean
}

export interface StructuredCallOptions {
  /** Max retries on validation failure (default: 1) */
  maxRetries?: number
  /** Override max_tokens (default: 2048 for structured output) */
  maxTokens?: number
  /** Additional provider options */
  providerOptions?: Omit<ProviderCallOptions, 'jsonMode' | 'maxTokens'>
}

// ─── Error Class ─────────────────────────────────────────────────────────────

export class StructuredOutputError extends Error {
  /** The raw text that failed validation */
  public readonly rawOutput: string
  /** Zod validation issues */
  public readonly issues: z.ZodIssue[]
  /** Provider that produced the invalid output */
  public readonly provider: ProviderMeta | null

  constructor(message: string, rawOutput: string, issues: z.ZodIssue[], provider: ProviderMeta | null = null) {
    super(message)
    this.name = 'StructuredOutputError'
    this.rawOutput = rawOutput
    this.issues = issues
    this.provider = provider
  }
}

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Call the LLM provider chain with structured output validation.
 *
 * 1. Sends messages with jsonMode enabled
 * 2. Parses the response as JSON
 * 3. Validates against the provided Zod schema
 * 4. On failure: retries once with an error hint appended
 * 5. On second failure: throws StructuredOutputError
 */
export async function callProviderStructured<T>(
  schema: z.ZodSchema<T>,
  messages: ChatMessageInput[],
  options: StructuredCallOptions = {},
): Promise<ValidatedResponse<T>> {
  const { maxRetries = 1, maxTokens = 2048 } = options

  let lastRawOutput = ''
  let lastIssues: z.ZodIssue[] = []
  let lastMeta: ProviderMeta | null = null
  let retried = false

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const currentMessages = attempt === 0
      ? messages
      : appendValidationHint(messages, lastRawOutput, lastIssues)

    const response = await callProviderWithFailover(currentMessages, {
      jsonMode: true,
      maxTokens,
      ...options.providerOptions,
    })

    lastMeta = response.meta
    lastRawOutput = response.text

    // Try to parse as JSON
    let parsed: unknown
    try {
      parsed = JSON.parse(response.text)
    } catch {
      // Response isn't valid JSON — build issues for the error
      lastIssues = [{
        code: 'custom',
        path: [],
        message: `Response is not valid JSON: ${response.text.slice(0, 200)}`,
      } as z.ZodIssue]
      if (attempt < maxRetries) {
        retried = true
        continue
      }
      throw new StructuredOutputError(
        'Provider returned non-JSON response after retry',
        response.text,
        lastIssues,
        lastMeta,
      )
    }

    // Validate against schema
    const result = schema.safeParse(parsed)
    if (result.success) {
      return { data: result.data, meta: response.meta, retried }
    }

    // Validation failed
    lastIssues = result.error.issues
    if (attempt < maxRetries) {
      retried = true
      continue
    }
  }

  // All attempts exhausted
  throw new StructuredOutputError(
    `Structured output validation failed after ${maxRetries + 1} attempt(s)`,
    lastRawOutput,
    lastIssues,
    lastMeta,
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Append a validation error hint to the messages so the LLM can self-correct.
 */
function appendValidationHint(
  messages: ChatMessageInput[],
  rawOutput: string,
  issues: z.ZodIssue[],
): ChatMessageInput[] {
  const issuesSummary = issues
    .slice(0, 5) // Don't overwhelm with too many issues
    .map((issue) => `- Path: ${issue.path.join('.')}, Error: ${issue.message}`)
    .join('\n')

  const hint: ChatMessageInput = {
    role: 'user',
    content: `Your previous response had validation errors. Please fix and try again.\n\nYour response was:\n${rawOutput.slice(0, 500)}\n\nValidation errors:\n${issuesSummary}\n\nPlease respond with corrected JSON only.`,
  }

  return [...messages, hint]
}
