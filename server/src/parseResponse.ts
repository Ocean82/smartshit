import { resolveIntent, isWeakResponse } from './intent.js'
import { ACTION_TOOL_NAMES } from '../../shared/toolRegistry.js'

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
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) return fence[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return null
}

export function parseAgentResponse(raw: string): {
  message: string
  actions: Array<{ tool: string; params: Record<string, unknown>; description: string }>
} {
  const jsonText = extractJsonObject(raw)
  if (!jsonText) {
    return { message: raw.trim(), actions: [] }
  }

  try {
    const parsed = JSON.parse(jsonText) as ParsedAgentJson
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : raw.trim()

    const actions = (parsed.actions ?? [])
      .filter((a) => a && typeof a.tool === 'string' && ALLOWED_TOOLS.has(a.tool))
      .map((a) => ({
        tool: a.tool,
        params: (a.params && typeof a.params === 'object' ? a.params : {}) as Record<string, unknown>,
        description: typeof a.description === 'string' && a.description.trim()
          ? a.description.trim()
          : `Run ${a.tool}`,
      }))

    return { message, actions }
  } catch {
    return { message: raw.trim(), actions: [] }
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
