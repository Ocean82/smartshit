import type { ServerChatResponse } from '@/ai/agentClient'

export function isWeakServerResponse(response: ServerChatResponse): boolean {
  const text = response.message.trim()
  if (response.actions.length > 0) return false
  if (!text || text === 'Done.' || text === 'Done') return true
  if (text.length < 12) return true
  return false
}
