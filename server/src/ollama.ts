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
        temperature: 0.3,
      },
    }),
    signal: AbortSignal.timeout(300_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama chat failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as OllamaChatResponse
  if (data.error) throw new Error(data.error)
  return data.message?.content?.trim() ?? ''
}
