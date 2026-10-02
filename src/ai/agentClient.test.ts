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

  it('retains a valid usage snapshot from the complete event (F16)', () => {
    const parsed = parseCompleteSseEvent({
      type: 'complete',
      message: 'Done',
      actions: [],
      source: 'llm',
      usage: { used: 3, remaining: 2, limit: 5 },
    })
    expect(parsed!.usage).toEqual({ used: 3, remaining: 2, limit: 5 })
  })

  it('ignores a malformed usage snapshot', () => {
    const parsed = parseCompleteSseEvent({
      type: 'complete',
      message: 'Done',
      actions: [],
      source: 'llm',
      usage: { used: 'three' } as never,
    })
    expect(parsed!.usage).toBeUndefined()
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

  // Regression for F6: network chunks don't align to line boundaries. A single
  // SSE event split mid-JSON across two reads must not be dropped.
  it('reassembles an event split across chunk boundaries', async () => {
    const encoder = new TextEncoder()
    const full =
      'data: {"type":"token","content":"Hi"}\n' +
      'data: {"type":"complete","message":"Done","actions":[],"source":"llm"}\n'

    // Split at every byte position; each split must still yield the same result.
    for (let cut = 1; cut < full.length; cut++) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(full.slice(0, cut)))
          controller.enqueue(encoder.encode(full.slice(cut)))
          controller.close()
        },
      })
      const tokens: string[] = []
      const result = await readAgentSseStream(stream.getReader(), (t) => tokens.push(t))
      expect(tokens, `split at ${cut}`).toEqual(['Hi'])
      expect(result?.message, `split at ${cut}`).toBe('Done')
    }
  })

  // A final event without a trailing newline must still be flushed at EOF.
  it('flushes a terminal event that has no trailing newline', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"complete","message":"End","actions":[],"source":"llm"}'))
        controller.close()
      },
    })
    const result = await readAgentSseStream(stream.getReader(), () => {})
    expect(result?.message).toBe('End')
  })

  // A multibyte UTF-8 character split across chunks must decode intact.
  it('reassembles a multibyte character split across chunks', async () => {
    const encoder = new TextEncoder()
    const bytes = encoder.encode('data: {"type":"complete","message":"café","actions":[],"source":"llm"}\n')
    // The é is two bytes; find a split inside it. Cut one byte before the newline
    // region is fine — instead split the whole payload near the middle at a
    // guaranteed multibyte boundary by cutting one byte short of the end.
    const cut = bytes.indexOf(0xc3) + 1 // between the two bytes of é
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut))
        controller.enqueue(bytes.slice(cut))
        controller.close()
      },
    })
    const result = await readAgentSseStream(stream.getReader(), () => {})
    expect(result?.message).toBe('café')
  })
})
