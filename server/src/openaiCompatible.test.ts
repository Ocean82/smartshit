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
