import { config } from './config.js'
import type { ChatMessageInput } from './prompt.js'

interface OllamaChatResponse {
  message?: { role: string; content: string }
  error?: string
}

export async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function modelIsRegistered(name = config.modelName): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const data = (await res.json()) as { models?: Array<{ name: string }> }
    return (data.models ?? []).some((m) => m.name === name || m.name.startsWith(`${name}:`))
  } catch {
    return false
  }
}

/** Non-streaming chat — used as fallback */
export async function chatWithOllama(messages: ChatMessageInput[]): Promise<string> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream: false,
      options: {
        num_ctx: config.numCtx,
        num_predict: config.numPredict,
        temperature: 0.2,
      },
    }),
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama chat failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as OllamaChatResponse
  if (data.error) throw new Error(data.error)
  return data.message?.content?.trim() ?? ''
}

/**
 * Streaming chat — yields text chunks as they arrive from Ollama.
 * Calls `onChunk` for each token and returns the full accumulated text.
 */
export async function chatWithOllamaStream(
  messages: ChatMessageInput[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      stream: true,
      options: {
        num_ctx: config.numCtx,
        num_predict: config.numPredict,
        temperature: 0.2,
      },
    }),
    signal: signal ?? AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama streaming failed (${res.status}): ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No readable stream from Ollama')

  const decoder = new TextDecoder()
  let accumulated = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    // Ollama streams newline-delimited JSON objects
    const lines = text.split('\n').filter(Boolean)

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
        const token = parsed.message?.content ?? ''
        if (token) {
          accumulated += token
          onChunk(token)
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  return accumulated
}
