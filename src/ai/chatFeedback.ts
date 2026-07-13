import { recordTelemetry } from '@/ai/telemetry'

export type ChatFeedbackRating = 'up' | 'down'

export interface ChatFeedbackEntry {
  messageId: string
  rating: ChatFeedbackRating
  timestamp: string
}

const STORAGE_KEY = 'smartsht-v1-chat-feedback'

export function loadChatFeedback(): ChatFeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ChatFeedbackEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getFeedbackForMessage(messageId: string): ChatFeedbackRating | null {
  return loadChatFeedback().find((e) => e.messageId === messageId)?.rating ?? null
}

export function recordChatFeedback(messageId: string, rating: ChatFeedbackRating): void {
  const entries = loadChatFeedback().filter((e) => e.messageId !== messageId)
  entries.push({ messageId, rating, timestamp: new Date().toISOString() })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-200)))
  } catch {
    // ignore quota errors
  }
  recordTelemetry(rating === 'up' ? 'feedbackUp' : 'feedbackDown', messageId)
}
