import { v4 as uuid } from 'uuid'
import type { AgentAction, ChatMessage, ProviderMeta } from '@/types'
import type { SpreadsheetContextPayload } from '@/ai/buildContext'
import { getAuthHeaders } from '@/lib/cloudSync'
import { getByokPayload } from '@/lib/userApiKey'
import { readAgentSseStream } from '@/ai/agentSse'

export {
  parseCompleteSseEvent,
  parseSseEventPayload,
} from '@/ai/agentSse'
export type { SseEventPayload } from '@/ai/agentSse'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''
const CHAT_TIMEOUT_MS = 120_000

export interface ServerAgentAction {
  tool: string
  params: Record<string, unknown>
  description: string
}

export interface ServerChatResponse {
  message: string
  actions: ServerAgentAction[]
  source: 'llm' | 'fallback' | 'template'
  reasoning?: string
  suggestions?: string[]
  meta?: ProviderMeta
}

/**
 * A non-200 server response that carries an actionable message (rate limit,
 * expired session, quota exhausted). These MUST be surfaced to the user rather
 * than swallowed into a null "server unreachable" — otherwise a logged-out or
 * rate-limited user sees a misleading local-insights dump instead of the real
 * "sign in again / slow down / upgrade" CTA the server worded for them.
 */
export interface AgentServerError {
  kind: 'server-error'
  /** Coarse category the pipeline can branch on. */
  status: 'rate_limited' | 'auth' | 'quota' | 'error'
  /** Human-readable message from the server body (already worded as a CTA). */
  message: string
  /** Raw HTTP status, for logging/telemetry. */
  httpStatus: number
}

export function isAgentServerError(
  value: ServerChatResponse | AgentServerError | null,
): value is AgentServerError {
  return value !== null && (value as AgentServerError).kind === 'server-error'
}

/** Default per-status messages when the server body omits one. */
const DEFAULT_ERROR_MESSAGE: Record<AgentServerError['status'], string> = {
  rate_limited: 'You are sending messages too quickly. Please wait a moment and try again.',
  auth: 'Your session has expired. Please sign in again to continue.',
  quota: "You've reached your free AI limit. Upgrade to Pro for unlimited access.",
  error: 'The AI service returned an error. Please try again in a moment.',
}

function statusKindFromHttp(httpStatus: number): AgentServerError['status'] {
  if (httpStatus === 401 || httpStatus === 403) return 'auth'
  if (httpStatus === 402) return 'quota'
  if (httpStatus === 429) return 'rate_limited'
  return 'error'
}

/**
 * Build an AgentServerError from a non-ok Response, reading `{ error | message }`
 * from the JSON body when present. Never throws — a body that isn't JSON falls
 * back to the per-status default message.
 */
async function toAgentServerError(res: Response): Promise<AgentServerError> {
  const status = statusKindFromHttp(res.status)
  let message = ''
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown }
    if (typeof body.message === 'string' && body.message.trim()) message = body.message
    else if (typeof body.error === 'string' && body.error.trim()) message = body.error
  } catch {
    // Non-JSON body — use the per-status default below.
  }
  return {
    kind: 'server-error',
    status,
    message: message || DEFAULT_ERROR_MESSAGE[status],
    httpStatus: res.status,
  }
}

export type AgentChatTurn = { role: 'user' | 'assistant'; content: string }

/** Shared payload for non-streaming and streaming chat. */
export interface AgentChatRequest {
  message: string
  context: SpreadsheetContextPayload
  history: AgentChatTurn[]
}

export interface AgentStreamChatRequest extends AgentChatRequest {
  onToken: (token: string) => void
  signal?: AbortSignal
}

export interface ServerHealth {
  ok: boolean
  ollama: boolean
  modelRegistered: boolean
  modelName: string
  groq?: boolean
  openrouter?: boolean
  huggingface?: boolean
  /** @deprecated use modelRegistered */
  modelFileExists?: boolean
}

export async function fetchServerHealth(): Promise<ServerHealth | null> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    return (await res.json()) as ServerHealth
  } catch {
    return null
  }
}

async function postAgentChat(
  path: string,
  request: AgentChatRequest,
  signal: AbortSignal,
): Promise<Response> {
  const headers = await getAuthHeaders()
  const byok = getByokPayload()
  const payload: Record<string, unknown> = {
    message: request.message,
    context: request.context,
    history: request.history,
  }
  if (byok) payload.byok = byok

  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  })
}

/** Non-streaming chat — fallback if SSE fails */
export async function chatWithAgentServer(
  request: AgentChatRequest,
): Promise<ServerChatResponse | AgentServerError | null> {
  try {
    const res = await postAgentChat('/api/chat', request, AbortSignal.timeout(CHAT_TIMEOUT_MS))
    // A 4xx here carries an actionable message (auth/rate-limit/quota) — surface
    // it instead of returning null, which the pipeline treats as "unreachable".
    if (!res.ok) return await toAgentServerError(res)
    return (await res.json()) as ServerChatResponse
  } catch {
    return null
  }
}

/**
 * Streaming chat via SSE.
 * Calls `onToken` with each text chunk as it arrives.
 * Returns the final structured response when complete.
 */
export async function chatWithAgentServerStream(
  request: AgentStreamChatRequest,
): Promise<ServerChatResponse | AgentServerError | null> {
  try {
    const res = await postAgentChat(
      '/api/chat/stream',
      request,
      request.signal ?? AbortSignal.timeout(CHAT_TIMEOUT_MS),
    )
    // Non-200 before the SSE stream opens (e.g. 401 expired token, 429 rate
    // limit from middleware) has a JSON body with an actionable message. Surface
    // it rather than dropping to null and rendering a misleading local fallback.
    if (!res.ok) return await toAgentServerError(res)
    const reader = res.body?.getReader()
    if (!reader) return null
    return readAgentSseStream(reader, request.onToken)
  } catch {
    return null
  }
}

export function serverResponseToChatMessage(
  response: ServerChatResponse,
  timestamp = Date.now(),
): ChatMessage {
  const actions: AgentAction[] = response.actions.map((action) => ({
    id: uuid(),
    tool: action.tool,
    params: action.params,
    description: action.description,
    status: 'pending',
  }))

  return {
    id: uuid(),
    role: 'assistant',
    content: response.message,
    timestamp,
    suggestions: response.suggestions,
    actions: actions.length > 0 ? actions : undefined,
    providerMeta: response.meta,
  }
}
