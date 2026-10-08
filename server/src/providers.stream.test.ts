import { describe, expect, it, vi } from 'vitest'

let groqSignal: AbortSignal | undefined
let groqChatSignal: AbortSignal | undefined
vi.mock('./groq.js', () => ({
  groqAvailable: () => true,
  recordGroqFallback: vi.fn(),
  chatWithGroqStream: (_m: unknown, _c: unknown, signal: AbortSignal) => {
    groqSignal = signal
    return new Promise(() => {})
  },
  chatWithGroq: (_m: unknown, options: { signal?: AbortSignal }) => {
    groqChatSignal = options.signal
    return new Promise(() => {})
  },
}))

const fallbackCompletion = { text: 'from fallback', finishReason: 'stop' }
vi.mock('./ollama.js', () => ({ chatWithOllama: async () => fallbackCompletion }))
vi.mock('./openaiCompatible.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./openaiCompatible.js')>()),
  chatWithOpenAiCompatible: async () => fallbackCompletion,
}))

const { callProviderStream, callProviderWithFailover, openRouterMaxTokens } = await import('./providers.js')
const { config } = await import('./config.js')

describe('openRouterMaxTokens', () => {
  it('caps requests at the credit-safe ceiling and leaves smaller or default requests alone', () => {
    expect(openRouterMaxTokens(100_000)).toBe(config.openRouterMaxTokens)
    expect(openRouterMaxTokens(1)).toBe(1)
    expect(openRouterMaxTokens(undefined)).toBeUndefined()
  })
})

describe('callProviderWithFailover timeout', () => {
  it('aborts the timed-out provider before failing over', async () => {
    vi.useFakeTimers()
    const call = callProviderWithFailover([])
    await vi.advanceTimersByTimeAsync(20_000)
    const response = await call
    expect(groqChatSignal?.aborted).toBe(true)
    expect(response.text).toBe('from fallback')
    vi.useRealTimers()
  })
})

describe('callProviderStream first-byte timeout', () => {
  it('aborts the upstream request when no data arrives in time', async () => {
    vi.useFakeTimers()
    const call = callProviderStream('groq', [], () => {}, new AbortController().signal)
    const rejected = expect(call).rejects.toThrow(/timed out/)

    await vi.advanceTimersByTimeAsync(20_000)

    await rejected
    expect(groqSignal?.aborted).toBe(true)
    vi.useRealTimers()
  })
})
