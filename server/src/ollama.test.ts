/**
 * Streaming chunk-boundary regression for the Ollama NDJSON reader (F6).
 *
 * Ollama streams newline-delimited JSON objects. A network chunk can split a
 * record mid-JSON; the reader must buffer across reads and reassemble it rather
 * than dropping the token.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { chatWithOllamaStream } from './ollama.js'

const messages = [{ role: 'user' as const, content: 'hi' }]

afterEach(() => {
  vi.restoreAllMocks()
})

function ndjsonStreamResponse(body: string, cut: number): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(body.slice(0, cut)))
      controller.enqueue(enc.encode(body.slice(cut)))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
}

describe('chatWithOllamaStream chunk buffering', () => {
  it('reassembles an NDJSON record split across network chunks', async () => {
    const body =
      `${JSON.stringify({ message: { content: 'Hello' } })}\n` +
      `${JSON.stringify({ message: { content: ' world' }, done: true })}\n`

    // Split at every byte position; each split must yield the full content.
    for (let cut = 1; cut < body.length; cut++) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonStreamResponse(body, cut))
      const result = await chatWithOllamaStream(messages, () => {})
      expect(result.text, `split at ${cut}`).toBe('Hello world')
      vi.restoreAllMocks()
    }
  })

  it('flushes a final record that has no trailing newline', async () => {
    const body = `${JSON.stringify({ message: { content: 'Done' }, done: true })}`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonStreamResponse(body, body.length))
    const result = await chatWithOllamaStream(messages, () => {})
    expect(result.text).toBe('Done')
  })
})

/**
 * Terminal done_reason capture (F11d).
 *
 * Ollama reports the stop reason on the final record (`done === true`) as
 * `done_reason`; the adapter must surface it so the provider loop can fail over
 * on a truncated completion rather than parsing a cut-off response.
 */
describe('chatWithOllamaStream done_reason capture (F11d)', () => {
  function ndjsonStream(body: string): Response {
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(body))
        controller.close()
      },
    })
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  }

  it('reports finishReason "length" when the final record is truncated', async () => {
    const body =
      `${JSON.stringify({ message: { content: 'partial' } })}\n` +
      `${JSON.stringify({ message: { content: '' }, done: true, done_reason: 'length' })}\n`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonStream(body))
    const result = await chatWithOllamaStream(messages, () => {})
    expect(result.finishReason).toBe('length')
  })

  it('reports finishReason "stop" for a clean completion', async () => {
    const body =
      `${JSON.stringify({ message: { content: 'done' }, done: true, done_reason: 'stop' })}\n`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonStream(body))
    const result = await chatWithOllamaStream(messages, () => {})
    expect(result.finishReason).toBe('stop')
  })

  it('falls back to "stop" when done is true but done_reason is absent', async () => {
    const body = `${JSON.stringify({ message: { content: 'done' }, done: true })}\n`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonStream(body))
    const result = await chatWithOllamaStream(messages, () => {})
    expect(result.finishReason).toBe('stop')
  })
})
