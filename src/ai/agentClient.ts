import { v4 as uuid } from 'uuid'
import type { AgentAction, ChatMessage, ProviderMeta } from '@/types'
import type { SpreadsheetContextPayload } from '@/ai/buildContext'
import { getAuthHeaders } from '@/lib/cloudSync'
import { getByokPayload } from '@/lib/userApiKey'

const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''

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

export interface SseEventPayload {
  type?: string
  content?: string
  message?: string
  actions?: ServerAgentAction[]
  source?: string
  reasoning?: string
  suggestions?: string[]
  meta?: ProviderMeta
}

/** Parse a raw SSE `data:` JSON string once. Returns null on malformed JSON. */
export function parseSseEventPayload(jsonStr: string): SseEventPayload | null {
  try {
    return JSON.parse(jsonStr) as SseEventPayload
  } catch {
    return null
  }
}

/** Allowed values for ServerChatResponse.source */
const VALID_SOURCES: ReadonlySet<ServerChatResponse['source']> = new Set(['llm', 'fallback', 'template'])

/** Runtime check that meta has the expected shape. */
function isValidProviderMeta(value: unknown): value is ProviderMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).provider === 'string' &&
    typeof (value as Record<string, unknown>).model === 'string'
  )
}

/** Map a pre-parsed SSE payload into a ServerChatResponse when type=complete. */
export function parseCompleteSseEvent(event: SseEventPayload): ServerChatResponse | null {
  if (event.type !== 'complete' || typeof event.message !== 'string') return null
  const source = VALID_SOURCES.has(event.source as ServerChatResponse['source'])
    ? (event.source as ServerChatResponse['source'])
    : 'llm'
  return {
    message: event.message,
    actions: Array.isArray(event.actions) ? event.actions : [],
    source,
    reasoning: event.reasoning,
    suggestions: event.suggestions,
    meta: isValidProviderMeta(event.meta) ? event.meta : undefined,
  }
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

/** Non-streaming chat — fallback if SSE fails */
export async function chatWithAgentServer(
  message: string,
  context: SpreadsheetContextPayload,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<ServerChatResponse | null> {
  try {
    const headers = await getAuthHeaders()
    const byok = getByokPayload()
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context, history, byok }),
      signal: AbortSignal.timeout(120_000),
    })
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
  message: string,
  context: SpreadsheetContextPayload,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onToken: (token: string) => void,
  signal?: AbortSignal,
): Promise<ServerChatResponse | null> {
  try {
    const headers = await getAuthHeaders()
    const byok = getByokPayload()
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context, history, byok }),
      signal: signal ?? AbortSignal.timeout(120_000),
    })

    if (!res.ok) return null
    const reader = res.body?.getReader()
    if (!reader) return null

    const decoder = new TextDecoder()
    let finalResponse: ServerChatResponse | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const jsonStr = line.slice(6).trim()
        if (!jsonStr) continue

        const event = parseSseEventPayload(jsonStr)
        if (!event) continue

        if (event.type === 'token' && typeof event.content === 'string') {
          onToken(event.content)
          continue
        }

        const complete = parseCompleteSseEvent(event)
        if (complete) finalResponse = complete
      }
    }

    return finalResponse
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null
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
