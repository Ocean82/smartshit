/**
 * Structured-output repair helpers (F11 a/b/c).
 *
 * Extracted from index.ts so they can be unit-tested without importing the HTTP
 * server (importing index.ts binds a port and boots every route). All of these
 * are pure or take their provider dependency as an argument.
 */
import type { ProviderName, ProviderResponse } from './providers.js'
import { parseAgentResponse, type ParseStatus } from './parseResponse.js'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
type ParsedAgentResult = ReturnType<typeof parseAgentResponse>

/**
 * Output-token budget for a single provider call. Mirrors index.ts's
 * MAX_TOKENS_PER_CALL — the BYOK path must match the server-funded path (F11a).
 */
export const MAX_TOKENS_PER_CALL = 2048

/**
 * Whether the LLM response merits a structured-output repair retry (act mode).
 *
 * Keys on the parser's outcome, NOT on `actions.length` (F11c): a well-formed
 * `{"message":"which column?","actions":[]}` is an intentional clarification
 * (`parseStatus === 'parsed'`) and must NOT retry — only a genuine parse
 * failure (`'unparsed'`) does. Applies to BOTH stream and non-stream act-mode
 * paths (F11b). A server provider must have produced the text
 * (`usedProvider !== null`) so the repair can re-request it.
 */
export function shouldRetryStructuredOutput(
  parseStatus: ParseStatus,
  fullText: string,
  usedProvider: ProviderName | null,
): boolean {
  return parseStatus === 'unparsed' && fullText.trim().length > 0 && usedProvider !== null
}

/** Build the BYOK call options to match the server-funded path (F11a). */
export function buildByokOptions(llmOnly: boolean): { jsonMode: boolean; maxTokens: number } {
  return { jsonMode: !llmOnly, maxTokens: MAX_TOKENS_PER_CALL }
}

/**
 * Whether a BYOK adapter error looks like the endpoint rejecting
 * `response_format: { type: 'json_object' }`. The adapter throws
 * `OpenAI-compatible … failed (<status>): <body>`; match a 400 whose body
 * mentions response_format / json mode / unsupported, so we can retry once
 * without jsonMode instead of hard-failing a JSON-mode-incapable endpoint. (F11a)
 */
export function isJsonModeRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b400\b/.test(msg) && /response_format|json_object|json mode|unsupported|not supported/i.test(msg)
}

/**
 * One bounded, internal correction call when the first act-mode response failed
 * to parse as structured output. Re-requests from the SAME server provider with
 * jsonMode on and a strict "respond with ONLY JSON" hint, then re-parses.
 *
 * Returns the repaired result ONLY when it both parses AND yields at least one
 * action; otherwise returns null so the caller keeps the original parse. This
 * is an internal re-request, NOT a billable turn: it does not stream to the
 * client and does not record usage (the route meters once, after runLlmChat).
 *
 * `callProvider` is injected so this can be tested without the provider stack.
 */
export async function repairStructuredOutput(
  messages: ChatMessage[],
  fullText: string,
  usedProvider: ProviderName,
  callProvider: (
    provider: ProviderName,
    messages: ChatMessage[],
    options: { jsonMode?: boolean; maxTokens?: number },
  ) => Promise<ProviderResponse>,
): Promise<ParsedAgentResult | null> {
  const retryHint: ChatMessage[] = [
    ...messages,
    { role: 'assistant', content: fullText },
    { role: 'user', content: 'Your response was not valid JSON. Please respond with ONLY a JSON object containing "message" (string) and "actions" (array of {tool, params, description}). No markdown, no explanation, just the JSON object.' },
  ]
  try {
    const retryResponse = await callProvider(usedProvider, retryHint, { jsonMode: true, maxTokens: MAX_TOKENS_PER_CALL })
    const retryParsed = parseAgentResponse(retryResponse.text)
    if (retryParsed.parseStatus === 'parsed' && retryParsed.actions.length > 0) {
      return retryParsed
    }
  } catch {
    // Repair failed — caller keeps the original parsed result.
  }
  return null
}
