import { describe, expect, it, vi } from 'vitest'

function rejectOnAbort(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })
}

const recordGroqFallback = vi.fn()
vi.mock('./groq.js', () => ({
  groqAvailable: () => true,
  recordGroqFallback,
  chatWithGroqStream: (_m: unknown, _c: unknown, signal: AbortSignal) => rejectOnAbort(signal),
  chatWithGroq: (_m: unknown, options: { signal?: AbortSignal }) => rejectOnAbort(options.signal),
}))

const fallbackCalls = vi.fn()
const fallbackCompletion = { text: 'from fallback', finishReason: 'stop' }
vi.mock('./ollama.js', () => ({
  chatWithOllama: async () => { fallbackCalls(); return fallbackCompletion },
  chatWithOllamaStream: async () => { fallbackCalls(); return fallbackCompletion },
}))
vi.mock('./openaiCompatible.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./openaiCompatible.js')>()),
  chatWithOpenAiCompatible: async () => { fallbackCalls(); return fallbackCompletion },
  chatWithOpenAiCompatibleStream: async () => { fallbackCalls(); return fallbackCompletion },
}))

const { callProviderWithFailover, callProviderStreamWithFailover, getCircuitBreakerStatus } = await import('./providers.js')

describe('user cancellation during failover', () => {
  it('streaming: rethrows without counting a provider failure or trying the next provider', async () => {
    const controller = new AbortController()
    const call = callProviderStreamWithFailover([], () => {}, controller.signal)
    const rejected = expect(call).rejects.toThrow()

    controller.abort()
    await rejected

    expect(getCircuitBreakerStatus().groq.failures).toBe(0)
    expect(recordGroqFallback).not.toHaveBeenCalled()
    expect(fallbackCalls).not.toHaveBeenCalled()
  })

  it('non-streaming: rethrows without counting a provider failure or trying the next provider', async () => {
    const controller = new AbortController()
    const call = callProviderWithFailover([], { signal: controller.signal })
    const rejected = expect(call).rejects.toThrow()

    controller.abort()
    await rejected

    expect(getCircuitBreakerStatus().groq.failures).toBe(0)
    expect(recordGroqFallback).not.toHaveBeenCalled()
    expect(fallbackCalls).not.toHaveBeenCalled()
  })
})
