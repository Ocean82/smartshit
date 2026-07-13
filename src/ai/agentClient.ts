import { v4 as uuid } from 'uuid'
import type { AgentAction, ChatMessage } from '@/types'
import type { SpreadsheetContextPayload } from '@/ai/buildContext'
import { getAuthHeaders } from '@/lib/cloudSync'

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
  suggestions?: string[]
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
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context, history }),
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
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, context, history }),
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
          const event = JSON.parse(jsonStr) as
            | { type: 'token'; content: string }
            | { type: 'complete'; message: string; actions: ServerAgentAction[]; source: string; suggestions?: string[] }

          if (event.type === 'token') {
            onToken(event.content)
          } else if (event.type === 'complete') {
            finalResponse = {
              message: event.message,
              actions: event.actions,
              source: event.source as ServerChatResponse['source'],
              suggestions: event.suggestions,
            }
          }
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
  }
}
