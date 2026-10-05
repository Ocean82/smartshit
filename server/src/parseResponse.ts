import { resolveIntent, isWeakResponse } from './intent.js'
import { ACTION_TOOL_NAMES } from '../../shared/toolRegistry.js'
import { sanitizeActionParams } from '../../shared/actionParams.js'
import { validateToolParams } from '../../shared/validateToolParams.js'
import { stripThinkingTags } from './thinkingTagStripper.js'

interface ParsedAgentJson {
  message?: string
  actions?: Array<{
    tool: string
    params?: Record<string, unknown>
    description?: string
  }>
}

// Derived from the shared registry — the server only returns actions the
// client executor (or template switch) can actually run.
const ALLOWED_TOOLS = new Set(ACTION_TOOL_NAMES)

function extractJsonObject(text: string): string | null {
  // Strip <think>...</think> blocks that reasoning models inject before/around JSON
  const cleaned = stripThinkingTags(text)

  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) return fence[1].trim()

  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1)
  return null
}

/**
 * Outcome of structured-output parsing.
 *
 * `'parsed'`   — a JSON object was extracted AND `JSON.parse` succeeded, even
 *                when `actions` is `[]` (a well-formed clarification such as
 *                `{"message":"which column?","actions":[]}`).
 * `'unparsed'` — extraction found no JSON object, or `JSON.parse` threw.
 *
 * The retry predicate keys on this (F11c): only `'unparsed'` is a real parse
 * failure worth a correction retry. A valid empty-actions clarification is
 * intentional output, not a failure, so it must NOT trigger the retry.
 */
export type ParseStatus = 'parsed' | 'unparsed'

export function parseAgentResponse(raw: string): {
  message: string
  actions: Array<{ tool: string; params: Record<string, unknown>; description: string }>
  parseStatus: ParseStatus
} {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) {
    // JSON extraction failed — return the cleaned text (thinking tags stripped)
    return { message: stripThinkingTags(raw), actions: [], parseStatus: 'unparsed' }
  }

  try {
    const parsed = JSON.parse(jsonText) as ParsedAgentJson
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : raw.trim()

    const actions = (parsed.actions ?? [])
      .filter((a) => a && typeof a.tool === 'string' && ALLOWED_TOOLS.has(a.tool))
      .map((a) => ({
        tool: a.tool,
        // Strip preview / signature / approval / execution-state fields: those
        // are produced by trusted local code, never by the model.
        params: sanitizeActionParams(a.params),
        description: typeof a.description === 'string' && a.description.trim()
          ? a.description.trim()
          : `Run ${a.tool}`,
      }))
      // Drop actions whose params don't satisfy the tool's declared contract
      // (missing required param, or wrong value type). An invalid proposal must
      // not reach the user as something to approve — it would only fail later
      // inside a handler, after the preview implied it was sound.
      .filter((a) => validateToolParams(a.tool, a.params).valid)

    // Parse succeeded even if actions is empty — a valid clarification.
    return { message, actions, parseStatus: 'parsed' }
  } catch {
    return { message: stripThinkingTags(raw), actions: [], parseStatus: 'unparsed' }
  }
}

export { resolveIntent, isWeakResponse }

/** @deprecated use resolveIntent */
export function matchesTemplateFastPath(message: string): boolean {
  return resolveIntent(message).actions.length > 0
}

/** @deprecated use resolveIntent */
export function fallbackFromKeywords(message: string) {
  const result = resolveIntent(message)
  if (result.message) return result
  return {
    message: 'Tell me what you want to track — for example "monthly budget", "business expenses", or "sales inventory". I will build it and show a preview before anything changes.',
    actions: [],
  }
}
