/**
 * BYOK token / JSON-mode parity + fallback (F11a).
 *
 * The BYOK path must forward the same options as the server-funded path:
 * `max_tokens: 2048` and `response_format: { type: 'json_object' }` for act
 * mode. If the endpoint rejects response_format, it must retry ONCE without
 * jsonMode (keeping the token budget) instead of hard-failing.
 *
 * callByokProvider lives in index.ts, which binds a port on import and cannot
 * be loaded in a unit test. These tests exercise the real adapter with the
 * real option builder + rejection detector that index.ts composes, so a
 * regression in either the forwarded body or the fallback trigger fails here.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { chatWithOpenAiCompatible } from './openaiCompatible.js'
import { buildByokOptions, isJsonModeRejection } from './structuredRetry.js'

const params = { baseUrl: 'https://byok.example.com/v1', apiKey: 'sk-byok', model: 'gpt-4o-mini' }
const messages = [{ role: 'user' as const, content: 'fill blanks with zero' }]

afterEach(() => {
  vi.restoreAllMocks()
})

function sentBody(fetchMock: ReturnType<typeof vi.spyOn>, callIndex = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit
  return JSON.parse(init.body as string) as Record<string, unknown>
}

function jsonResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('BYOK act-mode options (F11a)', () => {
  it('forwards max_tokens 2048 + response_format json_object when not llmOnly', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('{"message":"ok","actions":[]}'))
    await chatWithOpenAiCompatible(params, messages, buildByokOptions(false))
    expect(sentBody(fetchMock)).toMatchObject({
      max_tokens: 2048,
      response_format: { type: 'json_object' },
    })
  })

  it('forwards max_tokens 2048 but omits response_format for llmOnly (explain mode)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('plain prose'))
    await chatWithOpenAiCompatible(params, messages, buildByokOptions(true))
    const body = sentBody(fetchMock)
    expect(body.max_tokens).toBe(2048)
    expect(body).not.toHaveProperty('response_format')
  })
})

describe('BYOK JSON-mode fallback (F11a)', () => {
  it('a response_format-rejection 400 is detected and the no-jsonMode retry omits response_format', async () => {
    // First attempt: endpoint rejects response_format with a 400.
    // Retry (jsonMode off) succeeds. This mirrors callByokProvider's wiring:
    // run(opts) → catch → isJsonModeRejection → run without jsonMode.
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('response_format json_object not supported', { status: 400 }),
      )
      .mockResolvedValueOnce(jsonResponse('{"message":"ok","actions":[]}'))

    const opts = buildByokOptions(false)
    let text: string
    try {
      const completion = await chatWithOpenAiCompatible(params, messages, opts)
      text = completion.text
    } catch (err) {
      expect(isJsonModeRejection(err)).toBe(true)
      const completion = await chatWithOpenAiCompatible(params, messages, { ...opts, jsonMode: false })
      text = completion.text
    }

    expect(text).toBe('{"message":"ok","actions":[]}')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Retry kept the token budget but dropped response_format.
    const retryBody = sentBody(fetchMock, 1)
    expect(retryBody.max_tokens).toBe(2048)
    expect(retryBody).not.toHaveProperty('response_format')
  })

  it('a non-JSON-mode 400 is NOT treated as a json-mode rejection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bad api key', { status: 400 }))
    await expect(chatWithOpenAiCompatible(params, messages, buildByokOptions(false)))
      .rejects.toThrow(/400/)
    // The error must not match the json-mode fallback trigger.
    try {
      await chatWithOpenAiCompatible(params, messages, buildByokOptions(false))
    } catch (err) {
      expect(isJsonModeRejection(err)).toBe(false)
    }
  })
})
