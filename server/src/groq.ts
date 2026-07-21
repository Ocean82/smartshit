import { config } from './config.js'
import type { ChatMessageInput } from './prompt.js'

/**
 * Groq API client — OpenAI-compatible endpoint.
 * Primary AI backend for production (sub-1-second responses).
 */

interface GroqChoice {
  message?: { role: string; content: string }
}

interface GroqResponse {
  choices?: GroqChoice[]
  error?: { message: string }
}

export function groqAvailable(): boolean {
  return !!config.groqApiKey
}

export async function chatWithGroq(messages: ChatMessageInput[]): Promise<string> {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY not set')
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model: config.groqModel,
      messages,
      temperature: 0.2,
      max_tokens: 768,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq API failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as GroqResponse
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

/**
 * Streaming version — calls onChunk for each token.
 */
export async function chatWithGroqStream(
  messages: ChatMessageInput[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!config.groqApiKey) {
    throw new Error('GROQ_API_KEY not set')
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model: config.groqModel,
      messages,
      temperature: 0.2,
      max_tokens: 768,
      stream: true,
    }),
    signal: signal ?? AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq streaming failed (${res.status}): ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No readable stream from Groq')

  const decoder = new TextDecoder()
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n')

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (jsonStr === '[DONE]') continue
      if (!jsonStr) continue

      try {
        const parsed = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> }
        const token = parsed.choices?.[0]?.delta?.content ?? ''
        if (token) {
          accumulated += token
          onChunk(token)
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return accumulated
}
