import { v4 as uuid } from 'uuid'
import type { AgentAction, ChatMessage } from '@/types'
import type { SpreadsheetContextPayload } from '@/ai/buildContext'

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
}

export interface ServerHealth {
  ok: boolean
  ollama: boolean
  modelRegistered: boolean
  modelName: string
  modelFileExists: boolean
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

export async function chatWithAgentServer(
  message: string,
  context: SpreadsheetContextPayload,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<ServerChatResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context, history }),
      signal: AbortSignal.timeout(300_000),
    })
    if (!res.ok) return null
    return (await res.json()) as ServerChatResponse
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
    actions: actions.length > 0 ? actions : undefined,
  }
}
