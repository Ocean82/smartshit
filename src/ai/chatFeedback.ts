import { recordTelemetry } from '@/ai/telemetry'

export type ChatFeedbackRating = 'up' | 'down'

export interface ChatFeedbackEntry {
  messageId: string
  rating: ChatFeedbackRating
  timestamp: string
  /** Optional short context for quality/failover analysis (not sent remotely). */
  detail?: string
}

// amazonq-ignore-next-line
// amazonq-ignore-next-line
const STORAGE_NS = 'smartsht-v1-chat-feedback'

export function loadChatFeedback(): ChatFeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_NS)
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

export function recordChatFeedback(
  messageId: string,
  rating: ChatFeedbackRating,
  detail?: string,
): void {
  const trimmedDetail = detail?.trim().slice(0, 200) || undefined
  const entries = loadChatFeedback().filter((e) => e.messageId !== messageId)
  entries.push({
    messageId,
    rating,
    timestamp: new Date().toISOString(),
    detail: trimmedDetail,
  })
  try {
    localStorage.setItem(STORAGE_NS, JSON.stringify(entries.slice(-200)))
  } catch {
    // ignore quota errors
  }
  const telemetryDetail = trimmedDetail
    ? `${messageId}|${trimmedDetail}`
    : messageId
  recordTelemetry(rating === 'up' ? 'feedbackUp' : 'feedbackDown', telemetryDetail)
}
