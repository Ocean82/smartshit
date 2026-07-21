/**
 * Conversation summarization — compresses older messages into a brief summary
 * to preserve context without blowing the token budget.
 *
 * When history exceeds the summarization threshold, older messages are condensed
 * into a 1-paragraph "conversation so far" note injected before recent messages.
 */

import { AI_ANALYSIS_CONFIG } from '@/ai/config'

interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Summarize older messages into a brief context paragraph.
 * Keeps the most recent `recentCount` messages intact and compresses the rest.
 */
export function summarizeOlderMessages(
  history: HistoryMessage[],
  recentCount = 6,
): { summary: string | null; recentMessages: HistoryMessage[] } {
  if (history.length <= AI_ANALYSIS_CONFIG.summarizationThreshold) {
    return { summary: null, recentMessages: history }
  }

  const olderMessages = history.slice(0, -recentCount)
  const recentMessages = history.slice(-recentCount)

  if (olderMessages.length === 0) {
    return { summary: null, recentMessages: history }
  }

  const summaryParts: string[] = []

  // Extract key topics/actions from older messages
  const userTopics: string[] = []
  const aiActions: string[] = []

  for (const msg of olderMessages) {
    if (msg.role === 'user') {
      // Keep first 80 chars of each user message as a topic reference
      const topic = msg.content.slice(0, 80).replace(/\n/g, ' ').trim()
      if (topic) userTopics.push(topic)
    } else {
      // Extract key conclusions from AI responses (first sentence or bold text)
      const firstBold = msg.content.match(/\*\*(.+?)\*\*/)
      if (firstBold) {
        aiActions.push(firstBold[1].slice(0, 60))
      } else {
        const firstLine = msg.content.split('\n')[0]?.slice(0, 60) ?? ''
        if (firstLine && !firstLine.startsWith('Welcome')) {
          aiActions.push(firstLine)
        }
      }
    }
  }

  if (userTopics.length > 0) {
    summaryParts.push(`User previously asked about: ${userTopics.slice(-4).join('; ')}`)
  }
  if (aiActions.length > 0) {
    summaryParts.push(`Key findings: ${aiActions.slice(-3).join('; ')}`)
  }

  const summary = summaryParts.length > 0
    ? `[Conversation context — ${olderMessages.length} earlier messages summarized]\n${summaryParts.join('. ')}.`
    : null

  return { summary, recentMessages }
}

/**
 * Build optimized history for the LLM call.
 * Cloud providers get more messages; local Ollama gets fewer.
 */
export function buildOptimizedHistory(
  allMessages: HistoryMessage[],
  isCloudProvider: boolean,
): { messages: HistoryMessage[]; conversationSummary: string | null } {
  const maxHistory = isCloudProvider
    ? AI_ANALYSIS_CONFIG.maxHistoryCloud
    : AI_ANALYSIS_CONFIG.maxHistoryLocal

  // If history fits within limit, no summarization needed
  if (allMessages.length <= maxHistory) {
    return { messages: allMessages, conversationSummary: null }
  }

  // For cloud providers, summarize older messages
  if (isCloudProvider) {
    const { summary, recentMessages } = summarizeOlderMessages(allMessages, maxHistory - 2)
    return { messages: recentMessages, conversationSummary: summary }
  }

  // For local models, just truncate to the most recent messages
  return {
    messages: allMessages.slice(-maxHistory),
    conversationSummary: allMessages.length > maxHistory
      ? `[${allMessages.length - maxHistory} earlier messages omitted for context limit]`
      : null,
  }
}
