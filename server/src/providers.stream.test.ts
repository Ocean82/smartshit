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

const { callProviderStream, callProviderWithFailover } = await import('./providers.js')

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
