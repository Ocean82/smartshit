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
): Promise<ServerChatResponse | null> {
  try {
    const res = await postAgentChat('/api/chat', request, AbortSignal.timeout(CHAT_TIMEOUT_MS))
    if (!res.ok) return null
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
): Promise<ServerChatResponse | null> {
  try {
    const res = await postAgentChat(
      '/api/chat/stream',
      request,
      request.signal ?? AbortSignal.timeout(CHAT_TIMEOUT_MS),
    )
    const reader = res.ok ? res.body?.getReader() : undefined
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
