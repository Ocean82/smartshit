/**
 * Structured-output repair helpers (F11 a/b/c).
 *
 * These are the testable extractions from the chat handler:
 * - shouldRetryStructuredOutput — retries only on a real parse failure, never
 *   on an intentional empty-actions clarification (F11c).
 * - buildByokOptions / isJsonModeRejection — BYOK parity + JSON-mode fallback
 *   detection (F11a).
 * - repairStructuredOutput — the single bounded re-request shared by the
 *   streaming and non-streaming act-mode paths (F11b); callProvider is injected
 *   so it runs without the provider stack and records no usage.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ProviderName, ProviderResponse } from './providers.js'
import {
  shouldRetryStructuredOutput,
  buildByokOptions,
  isJsonModeRejection,
  repairStructuredOutput,
  MAX_TOKENS_PER_CALL,
} from './structuredRetry.js'

const messages = [{ role: 'user' as const, content: 'fill blanks with zero' }]

function providerResponse(text: string): ProviderResponse {
  return { text, finishReason: 'stop', meta: { provider: 'groq', model: 'test', latencyMs: 1 } }
}

describe('shouldRetryStructuredOutput (F11c)', () => {
  it('does NOT retry a well-formed empty-actions clarification', () => {
    // parseStatus 'parsed' means the model produced valid JSON on purpose.
    expect(shouldRetryStructuredOutput('parsed', '{"message":"which column?","actions":[]}', 'groq')).toBe(false)
  })

  it('does NOT retry a well-formed response that already has actions', () => {
    expect(shouldRetryStructuredOutput('parsed', '{"message":"ok","actions":[{}]}', 'groq')).toBe(false)
  })

  it('DOES retry an unparsed non-empty response from a server provider', () => {
    expect(shouldRetryStructuredOutput('unparsed', 'I can help you build a budget...', 'groq')).toBe(true)
  })

  it('does NOT retry when there is no text to repair', () => {
    expect(shouldRetryStructuredOutput('unparsed', '   ', 'groq')).toBe(false)
  })

  it('does NOT retry when no server provider produced the text (e.g. BYOK)', () => {
    expect(shouldRetryStructuredOutput('unparsed', 'prose', null)).toBe(false)
  })
})

describe('buildByokOptions (F11a)', () => {
  it('forwards jsonMode + 2048 tokens for act mode (not llmOnly)', () => {
    expect(buildByokOptions(false)).toEqual({ jsonMode: true, maxTokens: 2048 })
    expect(MAX_TOKENS_PER_CALL).toBe(2048)
  })

  it('disables jsonMode for explain/advise (llmOnly) but keeps 2048 tokens', () => {
    expect(buildByokOptions(true)).toEqual({ jsonMode: false, maxTokens: 2048 })
  })
})

describe('isJsonModeRejection (F11a)', () => {
  it('matches a 400 whose body mentions response_format', () => {
    const err = new Error('OpenAI-compatible API failed (400): {"error":"response_format not supported"}')
    expect(isJsonModeRejection(err)).toBe(true)
  })

  it('matches a 400 mentioning json_object', () => {
    expect(isJsonModeRejection(new Error('failed (400): json_object is not supported by this model'))).toBe(true)
  })

  it('does NOT match a 400 unrelated to JSON mode', () => {
    expect(isJsonModeRejection(new Error('OpenAI-compatible API failed (400): bad api key'))).toBe(false)
  })

  it('does NOT match a 500/timeout error', () => {
    expect(isJsonModeRejection(new Error('OpenAI-compatible API failed (500): response_format'))).toBe(false)
    expect(isJsonModeRejection(new Error('timeout'))).toBe(false)
  })
})

describe('repairStructuredOutput (F11b)', () => {
  it('returns the repaired result when the re-request yields valid actions', async () => {
    const callProvider = vi.fn(async (_p: ProviderName) =>
      providerResponse(JSON.stringify({ message: 'Fixed', actions: [{ tool: 'clear_sheet' }] })),
    )
    const repaired = await repairStructuredOutput(messages, 'not json', 'groq', callProvider)
    expect(repaired).not.toBeNull()
    expect(repaired!.actions).toHaveLength(1)
    expect(repaired!.message).toBe('Fixed')

    // One bounded internal re-request, with jsonMode + the shared token budget.
    expect(callProvider).toHaveBeenCalledTimes(1)
    const [, , opts] = callProvider.mock.calls[0]
    expect(opts).toEqual({ jsonMode: true, maxTokens: 2048 })
  })

  it('returns null when the re-request still produces no actions (keep original)', async () => {
    const callProvider = vi.fn(async () =>
      providerResponse(JSON.stringify({ message: 'still clarifying', actions: [] })),
    )
    const repaired = await repairStructuredOutput(messages, 'not json', 'groq', callProvider)
    expect(repaired).toBeNull()
  })

  it('returns null when the re-request still fails to parse', async () => {
    const callProvider = vi.fn(async () => providerResponse('more prose, no JSON'))
    const repaired = await repairStructuredOutput(messages, 'not json', 'groq', callProvider)
    expect(repaired).toBeNull()
  })

  it('returns null (never throws) when the re-request errors', async () => {
    const callProvider = vi.fn(async () => { throw new Error('provider down') })
    const repaired = await repairStructuredOutput(messages, 'not json', 'groq', callProvider)
    expect(repaired).toBeNull()
  })
})
