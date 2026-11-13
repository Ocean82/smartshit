/**
 * Groq rejects any request whose declared max_tokens exceeds the org OTPM limit
 * (429 "Request too large") before generating. Such requests must skip Groq:
 * no call, no breaker failure. Requests within the limit still use Groq.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const groqCalls: string[] = []
vi.mock('./groq.js', () => ({
  GROQ_DEFAULT_MAX_TOKENS: 2048,
  groqAvailable: () => true,
  recordGroqFallback: vi.fn(),
  chatWithGroq: async () => {
    groqCalls.push('chat')
    return { text: 'from groq', finishReason: 'stop' }
  },
  chatWithGroqStream: async (_m: unknown, onChunk: (c: string) => void) => {
    groqCalls.push('stream')
    onChunk('from groq')
    return { text: 'from groq', finishReason: 'stop' }
  },
}))
const fallback = { text: 'from fallback', finishReason: 'stop' }
vi.mock('./ollama.js', () => ({
  chatWithOllama: async () => fallback,
  chatWithOllamaStream: async (_m: unknown, onChunk: (c: string) => void) => {
    onChunk('from fallback')
    return fallback
  },
}))
vi.mock('./openaiCompatible.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./openaiCompatible.js')>()),
  chatWithOpenAiCompatible: async () => fallback,
  chatWithOpenAiCompatibleStream: async (_p: unknown, _m: unknown, onChunk: (c: string) => void) => {
    onChunk('from fallback')
    return fallback
  },
}))

const providers = await import('./providers.js')
const { config, positiveIntOr } = await import('./config.js')
const { providerAcceptsBudget, callProviderWithFailover, callProviderStreamWithFailover, getCircuitBreakerStatus, providerOrder } = providers

beforeEach(() => {
  groqCalls.length = 0
  providers.recordSuccess('groq') // reset Groq's breaker between tests
})

describe('providerAcceptsBudget', () => {
  it('Groq accepts budgets up to config.groqMaxTokens, and treats undefined as its 2048 default', () => {
    expect(providerAcceptsBudget('groq', config.groqMaxTokens)).toBe(true)
    expect(providerAcceptsBudget('groq', config.groqMaxTokens + 1)).toBe(false)
    expect(providerAcceptsBudget('groq', undefined)).toBe(2048 <= config.groqMaxTokens)
  })
  it('other providers are not limited here', () => {
    for (const p of ['openrouter', 'huggingface', 'ollama'] as const) expect(providerAcceptsBudget(p, 100_000)).toBe(true)
  })
})

describe('failover loops skip Groq for over-limit budgets', () => {
  it('sanity: Groq is first in the configured order', () => {
    expect(providerOrder()[0]).toBe('groq')
  })

  it('non-streaming, 2048: Groq is not called and its breaker is untouched', async () => {
    const res = await callProviderWithFailover([], { maxTokens: config.groqMaxTokens + 1 })
    expect(groqCalls).toEqual([])
    expect(res.text).toBe('from fallback')
    expect(getCircuitBreakerStatus().groq.failures).toBe(0)
  })

  it('non-streaming, within the limit: Groq answers', async () => {
    const res = await callProviderWithFailover([], { maxTokens: config.groqMaxTokens })
    expect(groqCalls).toEqual(['chat'])
    expect(res.text).toBe('from groq')
  })

  it('streaming, 2048: no Groq chunks reach the client', async () => {
    const chunks: string[] = []
    const res = await callProviderStreamWithFailover([], (c) => chunks.push(c), new AbortController().signal, {
      maxTokens: config.groqMaxTokens + 1,
    })
    expect(groqCalls).toEqual([])
    expect(chunks).toEqual(['from fallback'])
    expect(res.text).toBe('from fallback')
  })

  it('streaming, within the limit: Groq streams', async () => {
    const chunks: string[] = []
    await callProviderStreamWithFailover([], (c) => chunks.push(c), new AbortController().signal, {
      maxTokens: config.groqMaxTokens,
    })
    expect(groqCalls).toEqual(['stream'])
    expect(chunks).toEqual(['from groq'])
  })
})

describe('chat loop (index.ts callServerProviders) applies the same skip', () => {
  it('checks providerAcceptsBudget before calling a provider, without recording a failure', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    const start = src.indexOf('async function callServerProviders(')
    const body = src.slice(start, src.indexOf('\n}\n', start))
    const gate = body.indexOf('providerAcceptsBudget(provider, providerOpts.maxTokens)')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(body.indexOf('callProviderStream('))
    expect(gate).toBeLessThan(body.indexOf('callProvider('))
    // The skip branch continues without touching the breaker.
    const branch = body.slice(gate, body.indexOf('continue', gate))
    expect(branch).not.toMatch(/recordFailure/)
  })
})

describe('GROQ_MAX_TOKENS parsing', () => {
  it('accepts positive integers, falls back otherwise', () => {
    expect(positiveIntOr('4000', 1000)).toBe(4000)
    for (const bad of [undefined, '', '0', '-5', '1.5', 'abc', 'NaN']) expect(positiveIntOr(bad, 1000)).toBe(1000)
  })
})
