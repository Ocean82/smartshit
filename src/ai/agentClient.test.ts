import { describe, expect, it } from 'vitest'
import {
  parseCompleteSseEvent,
  parseSseEventPayload,
  serverResponseToChatMessage,
} from './agentClient'
import {
  applySseEvent,
  readAgentSseStream,
  sseJsonPayloadsFromChunk,
} from './agentSse'

describe('parseSseEventPayload', () => {
  it('parses valid JSON once', () => {
    const event = parseSseEventPayload(JSON.stringify({ type: 'token', content: 'hi' }))
    expect(event).toEqual({ type: 'token', content: 'hi' })
  })

  it('returns null for malformed JSON', () => {
    expect(parseSseEventPayload('{not-json')).toBeNull()
  })
})

describe('parseCompleteSseEvent', () => {
  it('retains provider meta from complete events', () => {
    const event = parseSseEventPayload(JSON.stringify({
      type: 'complete',
      message: 'Sorted column B',
      actions: [],
      source: 'llm',
      meta: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    }))
    expect(event).not.toBeNull()
    const parsed = parseCompleteSseEvent(event!)
    expect(parsed).not.toBeNull()
    expect(parsed!.meta).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    })
  })

  it('returns null for token events', () => {
    expect(parseCompleteSseEvent({ type: 'token', content: 'hi' })).toBeNull()
  })

  it('returns null when message is missing', () => {
    expect(parseCompleteSseEvent({ type: 'complete' })).toBeNull()
  })
})

describe('serverResponseToChatMessage', () => {
  it('copies provider meta onto ChatMessage', () => {
    const msg = serverResponseToChatMessage({
      message: 'Done',
      actions: [],
      source: 'llm',
      meta: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
    })
    expect(msg.providerMeta).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    })
  })
})

describe('sseJsonPayloadsFromChunk', () => {
  it('extracts JSON from data lines and skips noise', () => {
    const payloads = sseJsonPayloadsFromChunk(
      'event: ping\ndata: {"type":"token","content":"Hi"}\n\ndata: \nignored\n',
    )
    expect(payloads).toEqual(['{"type":"token","content":"Hi"}'])
  })
})

describe('applySseEvent', () => {
  it('emits token content without replacing the complete response', () => {
    const tokens: string[] = []
    const current = {
      message: 'done',
      actions: [],
      source: 'llm' as const,
    }
    const next = applySseEvent({ type: 'token', content: 'Hi' }, (token) => tokens.push(token), current)
    expect(tokens).toEqual(['Hi'])
    expect(next).toBe(current)
  })

  it('replaces the accumulator on a complete event', () => {
    const next = applySseEvent(
      { type: 'complete', message: 'Sorted', actions: [], source: 'llm' },
      () => {},
      null,
    )
    expect(next?.message).toBe('Sorted')
  })
})

describe('readAgentSseStream', () => {
  it('replays tokens then returns the complete payload', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"token","content":"Hel"}\n'))
        controller.enqueue(encoder.encode('data: {"type":"token","content":"lo"}\n'))
        controller.enqueue(encoder.encode('data: {"type":"complete","message":"Hello","actions":[],"source":"llm"}\n'))
        controller.close()
      },
    })

    const tokens: string[] = []
    const result = await readAgentSseStream(stream.getReader(), (token) => tokens.push(token))

    expect(tokens).toEqual(['Hel', 'lo'])
    expect(result).toEqual({
      message: 'Hello',
      actions: [],
      source: 'llm',
      reasoning: undefined,
      suggestions: undefined,
      meta: undefined,
    })
  })
})
