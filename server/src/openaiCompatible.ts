import type { ChatMessageInput } from './prompt.js'

interface OpenAICompatibleChoice {
  message?: { role: string; content: string }
}

interface OpenAICompatibleResponse {
  choices?: OpenAICompatibleChoice[]
  error?: { message?: string }
}

interface OpenAICompatibleParams {
  baseUrl: string
  apiKey: string
  model: string
}

function buildUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`
}

export function openAiCompatibleAvailable({ apiKey, model, baseUrl }: OpenAICompatibleParams): boolean {
  return Boolean(apiKey && model && baseUrl)
}

export async function chatWithOpenAiCompatible(
  params: OpenAICompatibleParams,
  messages: ChatMessageInput[],
): Promise<string> {
  const res = await fetch(buildUrl(params.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages,
      temperature: 0.2,
      max_tokens: 768,
      stream: false,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI-compatible API failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as OpenAICompatibleResponse
  if (data.error?.message) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function chatWithOpenAiCompatibleStream(
  params: OpenAICompatibleParams,
  messages: ChatMessageInput[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(buildUrl(params.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      messages,
      temperature: 0.2,
      max_tokens: 768,
      stream: true,
    }),
    signal: signal ?? AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI-compatible streaming failed (${res.status}): ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No readable stream from OpenAI-compatible provider')

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
      if (!jsonStr || jsonStr === '[DONE]') continue

      try {
        const parsed = JSON.parse(jsonStr) as { choices?: Array<{ delta?: { content?: string } }> }
        const token = parsed.choices?.[0]?.delta?.content ?? ''
        if (!token) continue
        accumulated += token
        onChunk(token)
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return accumulated
}
