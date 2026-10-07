import { config } from './config.js'
import type { ChatMessageInput } from './prompt.js'
import type { AdapterCompletion } from './openaiCompatible.js'
import { stripThinkingTags, createThinkingTagFilter } from './thinkingTagStripper.js'
import { withRequestTimeout } from './openaiCompatible.js'

interface OllamaChatResponse {
  message?: { role: string; content: string }
  error?: string
  done?: boolean
  done_reason?: string
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
export async function chatWithOllama(
  messages: ChatMessageInput[],
  options: { jsonMode?: boolean; signal?: AbortSignal } = {},
): Promise<AdapterCompletion> {
  const body: Record<string, unknown> = {
    model: config.modelName,
    messages,
    stream: false,
    options: {
      num_ctx: config.numCtx,
      num_predict: config.numPredict,
      temperature: 0.2,
    },
  }

  // Ollama supports a top-level `format` field for JSON output
  if (options.jsonMode) {
    body.format = 'json'
  }

  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: withRequestTimeout(options.signal, 120_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama chat failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as OllamaChatResponse
  if (data.error) throw new Error(data.error)
  const raw = data.message?.content?.trim() ?? ''
  // Ollama reports done_reason ('stop'/'length'); fall back to done→'stop'.
  const finishReason = data.done_reason ?? (data.done ? 'stop' : null)
  return { text: stripThinkingTags(raw), finishReason }
}



/**
 * Streaming chat — yields text chunks as they arrive from Ollama.
 * Calls `onChunk` for each token and returns the full accumulated text.
 */
export async function chatWithOllamaStream(
  messages: ChatMessageInput[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  options: { jsonMode?: boolean } = {},
): Promise<AdapterCompletion> {
  const body: Record<string, unknown> = {
    model: config.modelName,
    messages,
    stream: true,
    options: {
      num_ctx: config.numCtx,
      num_predict: config.numPredict,
      temperature: 0.2,
    },
  }

  if (options.jsonMode) {
    body.format = 'json'
  }

  const res = await fetch(`${config.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  // Ollama streams newline-delimited JSON. A network chunk can split a record
  // mid-JSON, so buffer across reads and only parse up to the last newline;
  // flush any remainder at EOF.
  let buffer = ''
  // Terminal stop reason (F11d): the final record (done === true) carries it.
  let finishReason: string | null = null
  const cleanOnChunk = createThinkingTagFilter(onChunk)

  const consumeLine = (line: string): void => {
    if (!line) return
    try {
      const parsed = JSON.parse(line) as {
        message?: { content?: string }
        done?: boolean
        done_reason?: string
      }
      if (parsed.done) finishReason = parsed.done_reason ?? 'stop'
      const token = parsed.message?.content ?? ''
      if (token) {
        accumulated += token
        cleanOnChunk(token)
      }
    } catch {
      // Skip malformed lines
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const newlineIdx = buffer.lastIndexOf('\n')
    if (newlineIdx === -1) continue
    const complete = buffer.slice(0, newlineIdx)
    buffer = buffer.slice(newlineIdx + 1)
    for (const line of complete.split('\n')) consumeLine(line)
  }

  buffer += decoder.decode()
  if (buffer.length > 0) {
    for (const line of buffer.split('\n')) consumeLine(line)
  }

  return { text: stripThinkingTags(accumulated), finishReason }
}
