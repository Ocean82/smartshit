/**
 * Terminal finish_reason capture for the Groq adapter (F11d).
 *
 * Groq is OpenAI-shaped: the final streamed delta event (and the non-streaming
 * response's choice) carries `finish_reason`. The adapter must surface it so
 * the provider loop can treat a `length`/truncated completion as a failure
 * before parsing. config.ts reads GROQ_API_KEY once at import, so the key is set
 * before groq.js is dynamically imported.
 */
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'

process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-groq-key'

const messages = [{ role: 'user' as const, content: 'hi' }]

type GroqModule = typeof import('./groq.js')
let groq: GroqModule

beforeAll(async () => {
  groq = await import('./groq.js')
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** SSE body whose final content event carries a finish_reason. */
function sseWithFinish(reason: string): Response {
  const body =
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' }, finish_reason: null }] })}\n` +
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n` +
    'data: [DONE]\n'
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('chatWithGroqStream finish_reason capture (F11d)', () => {
  it('reports finishReason "length" when the stream is truncated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseWithFinish('length'))
    const result = await groq.chatWithGroqStream(messages, () => {})
    expect(result.finishReason).toBe('length')
    expect(result.text).toBe('partial')
  })

  it('reports finishReason "stop" for a clean completion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseWithFinish('stop'))
    const result = await groq.chatWithGroqStream(messages, () => {})
    expect(result.finishReason).toBe('stop')
  })
})

describe('chatWithGroq finish_reason capture (F11d)', () => {
  it('reports finishReason from the non-streaming response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'cut off' }, finish_reason: 'length' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const result = await groq.chatWithGroq(messages)
    expect(result).toEqual({ text: 'cut off', finishReason: 'length' })
  })
})
