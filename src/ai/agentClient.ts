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

/** Parse an SSE `data:` JSON payload into a ServerChatResponse when type=complete. */
export function parseCompleteSseEvent(jsonStr: string): ServerChatResponse | null {
  try {
    const event = JSON.parse(jsonStr) as {
      type?: string
      message?: string
      actions?: ServerAgentAction[]
      source?: string
      reasoning?: string
      suggestions?: string[]
      meta?: ProviderMeta
    }
    if (event.type !== 'complete' || typeof event.message !== 'string') return null
    return {
      message: event.message,
      actions: Array.isArray(event.actions) ? event.actions : [],
      source: (event.source as ServerChatResponse['source']) ?? 'llm',
      reasoning: event.reasoning,
      suggestions: event.suggestions,
      meta: event.meta,
    }
  } catch {
    return null
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

        try {
          const parsed = JSON.parse(jsonStr) as { type?: string; content?: string }
          if (parsed.type === 'token' && typeof parsed.content === 'string') {
            onToken(parsed.content)
            continue
          }
          const complete = parseCompleteSseEvent(jsonStr)
          if (complete) finalResponse = complete
        } catch {
          // Skip malformed events
        }
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
