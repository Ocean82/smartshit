import type { ProviderMeta } from '@/types'
import type { ServerChatResponse, ServerAgentAction } from '@/ai/agentClient'

export interface SseEventPayload {
  type?: string
  content?: string
  message?: string
  actions?: ServerAgentAction[]
  source?: string
  reasoning?: string
  suggestions?: string[]
  meta?: ProviderMeta
}

type SseEventEffect =
  | { kind: 'token'; content: string }
  | { kind: 'complete'; response: ServerChatResponse }
  | { kind: 'none' }

const SSE_DATA_PREFIX = 'data: '

/** Allowed values for ServerChatResponse.source */
const VALID_SOURCES: ReadonlySet<ServerChatResponse['source']> = new Set(['llm', 'fallback', 'template'])

/** Parse a raw SSE `data:` JSON string once. Returns null on malformed JSON. */
export function parseSseEventPayload(jsonStr: string): SseEventPayload | null {
  try {
    return JSON.parse(jsonStr) as SseEventPayload
  } catch {
    return null
  }
}

function isValidProviderMeta(value: unknown): value is ProviderMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).provider === 'string' &&
    typeof (value as Record<string, unknown>).model === 'string'
  )
}

/** Map a pre-parsed SSE payload into a ServerChatResponse when type=complete. */
export function parseCompleteSseEvent(event: SseEventPayload): ServerChatResponse | null {
  if (event.type !== 'complete' || typeof event.message !== 'string') return null
  const source = VALID_SOURCES.has(event.source as ServerChatResponse['source'])
    ? (event.source as ServerChatResponse['source'])
    : 'llm'
  return {
    message: event.message,
    actions: Array.isArray(event.actions) ? event.actions : [],
    source,
    reasoning: event.reasoning,
    suggestions: event.suggestions,
    meta: isValidProviderMeta(event.meta) ? event.meta : undefined,
  }
}

/** Pull JSON payloads from `data:` lines in one decoded SSE chunk. */
export function sseJsonPayloadsFromChunk(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => line.startsWith(SSE_DATA_PREFIX))
    .map((line) => line.slice(SSE_DATA_PREFIX.length).trim())
    .filter((jsonStr) => jsonStr.length > 0)
}

function tokenEffect(event: SseEventPayload): SseEventEffect {
  if (typeof event.content !== 'string') return { kind: 'none' }
  return { kind: 'token', content: event.content }
}

function completeEffect(event: SseEventPayload): SseEventEffect {
  const response = parseCompleteSseEvent(event)
  if (!response) return { kind: 'none' }
  return { kind: 'complete', response }
}

const SSE_EFFECT_BY_TYPE: Record<string, (event: SseEventPayload) => SseEventEffect> = {
  token: tokenEffect,
  complete: completeEffect,
}

function sseEventEffect(event: SseEventPayload): SseEventEffect {
  const resolve = event.type ? SSE_EFFECT_BY_TYPE[event.type] : undefined
  return resolve ? resolve(event) : { kind: 'none' }
}

/**
 * Apply one SSE event: emit tokens, or replace the accumulated complete response.
 */
export function applySseEvent(
  event: SseEventPayload,
  onToken: (token: string) => void,
  current: ServerChatResponse | null,
): ServerChatResponse | null {
  const effect = sseEventEffect(event)
  if (effect.kind === 'token') {
    onToken(effect.content)
    return current
  }
  if (effect.kind === 'complete') return effect.response
  return current
}

export async function readAgentSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onToken: (token: string) => void,
): Promise<ServerChatResponse | null> {
  const decoder = new TextDecoder()
  let finalResponse: ServerChatResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const payloads = sseJsonPayloadsFromChunk(decoder.decode(value, { stream: true }))
    for (const jsonStr of payloads) {
      const event = parseSseEventPayload(jsonStr)
      if (!event) continue
      finalResponse = applySseEvent(event, onToken, finalResponse)
    }
  }

  return finalResponse
}
