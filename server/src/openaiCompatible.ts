import type { ChatMessageInput } from './prompt.js'
import { stripThinkingTags, createThinkingTagFilter } from './thinkingTagStripper.js'

interface OpenAICompatibleChoice {
  message?: { role: string; content: string }
}

interface OpenAICompatibleResponse {
  choices?: OpenAICompatibleChoice[]
  error?: { message?: string }
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

interface OpenAICompatibleParams {
  baseUrl: string
  apiKey: string
  model: string
}

export interface OpenAICompatibleCallOptions {
  /** Enable JSON response format for structured output. */
  jsonMode?: boolean
  /** Override max_tokens (default: 768, raised for tool/act calls). */
  maxTokens?: number
  /**
   * Ask the provider to skip its reasoning phase — OpenRouter honours
   * `reasoning: { exclude: true }`, which keeps fallback output as clean as
   * Groq's `reasoning_effort: 'none'` and stops us paying for tokens we
   * discard.
   *
   * Opt-in and off by default. HuggingFace's router support for this field is
   * inconsistent, and an unrecognised key can fail the request outright — which
   * would take down the fallback path itself, the exact thing this exists to
   * prevent. BYOK callers must also leave it off: the provider is unknown there.
   */
  suppressReasoning?: boolean
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
  options: OpenAICompatibleCallOptions = {},
): Promise<string> {
  const { jsonMode = false, maxTokens = 768, suppressReasoning = false } = options

  const body: Record<string, unknown> = {
    model: params.model,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: false,
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  if (suppressReasoning) {
    body.reasoning = { exclude: true }
  }

  const res = await fetch(buildUrl(params.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
    // SSRF guard: never follow redirects. A validated public baseUrl could
    // otherwise 3xx the request to an internal address (e.g. the cloud
    // metadata endpoint). opaqueredirect surfaces here as a non-ok response.
    redirect: 'manual',
  })

  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new Error('OpenAI-compatible API attempted a redirect, which is refused for security')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI-compatible API failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as OpenAICompatibleResponse
  if (data.error?.message) throw new Error(data.error.message)
  const raw = data.choices?.[0]?.message?.content?.trim() ?? ''
  return stripThinkingTags(raw)
}

export async function chatWithOpenAiCompatibleStream(
  params: OpenAICompatibleParams,
  messages: ChatMessageInput[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  options: OpenAICompatibleCallOptions = {},
): Promise<string> {
  const { jsonMode = false, maxTokens = 768, suppressReasoning = false } = options

  const body: Record<string, unknown> = {
    model: params.model,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens,
    stream: true,
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  if (suppressReasoning) {
    body.reasoning = { exclude: true }
  }

  const res = await fetch(buildUrl(params.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(30_000),
    // SSRF guard: never follow redirects (see chatWithOpenAiCompatible).
    redirect: 'manual',
  })

  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
    throw new Error('OpenAI-compatible provider attempted a redirect, which is refused for security')
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`OpenAI-compatible streaming failed (${res.status}): ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No readable stream from OpenAI-compatible provider')

  const decoder = new TextDecoder()
  let accumulated = ''
  const cleanOnChunk = createThinkingTagFilter(onChunk)
  // Reasoning models (e.g. qwen3) stream `delta.reasoning` before any
  // `delta.content`. The caller's first-byte timeout disarms on the first
  // onChunk() call, so a long reasoning phase with no content would trip it
  // even though data is flowing. Emit ONE empty liveness ping (bypassing the
  // thinking-tag filter, which swallows empty strings) so the timeout disarms
  // without leaking reasoning text to the user.
  let pingedForReasoning = false
  // A network chunk can split an SSE line mid-JSON, so buffer across reads and
  // only parse up to the last newline; flush any remainder at EOF.
  let buffer = ''

  const consumeLine = (line: string): void => {
    if (!line.startsWith('data: ')) return
    const jsonStr = line.slice(6).trim()
    if (!jsonStr || jsonStr === '[DONE]') return
    try {
      const parsed = JSON.parse(jsonStr) as {
        choices?: Array<{ delta?: { content?: string; reasoning?: string } }>
      }
      const delta = parsed.choices?.[0]?.delta
      const token = delta?.content ?? ''
      if (token) {
        accumulated += token
        cleanOnChunk(token)
        return
      }
      // Reasoning-only chunk: mark the stream live once so the first-byte
      // timeout doesn't fire during the reasoning phase.
      if (!pingedForReasoning && delta?.reasoning) {
        pingedForReasoning = true
        onChunk('')
      }
    } catch {
      // Skip malformed chunks
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

  return stripThinkingTags(accumulated)
}
