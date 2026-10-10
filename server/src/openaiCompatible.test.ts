/**
 * SSRF redirect-refusal tests for the OpenAI-compatible client.
 *
 * Both call paths must set redirect: 'manual' and treat a 3xx / opaqueredirect
 * response as an error, so a validated public baseUrl cannot bounce the request
 * to an internal address.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { chatWithOpenAiCompatible, chatWithOpenAiCompatibleStream } from './openaiCompatible.js'

const params = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' }
const messages = [{ role: 'user' as const, content: 'hi' }]

afterEach(() => {
  vi.restoreAllMocks()
})

/** Build a mock SSE Response body from an array of delta objects. */
function sseResponse(deltas: Array<Record<string, unknown>>): Response {
  const lines = deltas
    .map((d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n`)
    .concat('data: [DONE]\n')
    .join('')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('openaiCompatible SSRF redirect handling', () => {
  it('passes redirect: "manual" to fetch', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await chatWithOpenAiCompatible(params, messages)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({ redirect: 'manual' }),
    )
  })

  it('refuses an opaqueredirect response (non-streaming)', async () => {
    // redirect: 'manual' surfaces a redirect as an opaqueredirect Response (status 0).
    const opaque = Response.error() as Response
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(opaque)
    await expect(chatWithOpenAiCompatible(params, messages)).rejects.toThrow(/redirect/i)
  })

  it('refuses a 3xx response (streaming)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }),
    )
    await expect(
      chatWithOpenAiCompatibleStream(params, messages, () => {}),
    ).rejects.toThrow(/redirect/i)
  })
})

describe('openaiCompatible streaming — reasoning models', () => {
  it('emits one empty liveness ping when reasoning arrives before content', async () => {
    // qwen3-style stream: reasoning tokens first, then real content.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        { reasoning: 'let me think...' },
        { reasoning: 'still thinking' },
        { content: 'Hello' },
        { content: ' world' },
      ]),
    )

    const chunks: string[] = []
    const result = await chatWithOpenAiCompatibleStream(params, messages, (c) => chunks.push(c))

    // The first chunk is the empty liveness ping (disarms the caller's
    // first-byte timeout during the reasoning phase); content follows.
    expect(chunks[0]).toBe('')
    expect(chunks.filter((c) => c === '').length).toBe(1) // pinged exactly once
    expect(result.text).toBe('Hello world')
    expect(chunks.join('')).toBe('Hello world')
  })

  it('does not ping when content arrives immediately (no reasoning)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([{ content: 'Hi' }, { content: ' there' }]),
    )
    const chunks: string[] = []
    const result = await chatWithOpenAiCompatibleStream(params, messages, (c) => chunks.push(c))
    expect(chunks.some((c) => c === '')).toBe(false)
    expect(result.text).toBe('Hi there')
  })

  // Regression for F6: a provider SSE line split mid-JSON across two network
  // chunks must be reassembled, not dropped.
  it('reassembles content when an SSE line is split across network chunks', async () => {
    const body =
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\n` +
      'data: [DONE]\n'
    const enc = new TextEncoder()

    // Split at every byte position; every split must yield the full content.
    for (let cut = 1; cut < body.length; cut++) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode(body.slice(0, cut)))
          controller.enqueue(enc.encode(body.slice(cut)))
          controller.close()
        },
      })
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      )
      const result = await chatWithOpenAiCompatibleStream(params, messages, () => {})
      expect(result.text, `split at ${cut}`).toBe('Hello world')
      vi.restoreAllMocks()
    }
  })
})

/**
 * Terminal finish-reason capture (F11d).
 *
 * The adapter must surface the provider's terminal stop reason so the provider
 * loop can treat a `length` (truncated) or missing-terminal completion as a
 * failure BEFORE parsing, instead of parsing a cut-off response as if whole.
 */
describe('openaiCompatible finish_reason capture (F11d)', () => {
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

  it('reports finishReason "length" when the stream is truncated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseWithFinish('length'))
    const result = await chatWithOpenAiCompatibleStream(params, messages, () => {})
    expect(result.finishReason).toBe('length')
  })

  it('reports finishReason "stop" for a clean completion', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseWithFinish('stop'))
    const result = await chatWithOpenAiCompatibleStream(params, messages, () => {})
    expect(result.finishReason).toBe('stop')
  })

  it('reports finishReason from the non-streaming response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'cut off' }, finish_reason: 'length' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const result = await chatWithOpenAiCompatible(params, messages)
    expect(result).toEqual({ text: 'cut off', finishReason: 'length' })
  })
})

/**
 * Reasoning suppression (PRODUCTION-TODO Option 2).
 *
 * OpenRouter honours `reasoning: { effort: 'none', exclude: true }`, which stops
 * the fallback path paying for a reasoning phase it would otherwise discard. It must be
 * opt-in: HuggingFace's router support is inconsistent and an unrecognised key
 * can fail the request, taking down the very fallback this protects.
 */
describe('openaiCompatible reasoning suppression', () => {
  function sentBody(fetchMock: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    return JSON.parse(init.body as string) as Record<string, unknown>
  }

  it('sends reasoning.exclude when suppressReasoning is set (non-streaming)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await chatWithOpenAiCompatible(params, messages, { suppressReasoning: true })
    expect(sentBody(fetchMock)).toMatchObject({ reasoning: { effort: 'none', exclude: true } })
  })

  it('sends reasoning.exclude when suppressReasoning is set (streaming)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([{ content: 'ok' }]))
    await chatWithOpenAiCompatibleStream(params, messages, () => {}, undefined, {
      suppressReasoning: true,
    })
    expect(sentBody(fetchMock)).toMatchObject({ reasoning: { effort: 'none', exclude: true } })
  })

  it('omits the field by default, so unknown providers are never sent it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await chatWithOpenAiCompatible(params, messages)
    expect(sentBody(fetchMock)).not.toHaveProperty('reasoning')
  })

  it('omits the field for a default streaming call (BYOK path)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(sseResponse([{ content: 'ok' }]))
    await chatWithOpenAiCompatibleStream(params, messages, () => {})
    expect(sentBody(fetchMock)).not.toHaveProperty('reasoning')
  })

  it('combines with jsonMode without dropping either flag', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await chatWithOpenAiCompatible(params, messages, { jsonMode: true, suppressReasoning: true })
    expect(sentBody(fetchMock)).toMatchObject({
      response_format: { type: 'json_object' },
      reasoning: { effort: 'none', exclude: true },
    })
  })
})
