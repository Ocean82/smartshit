import { describe, expect, it, vi } from 'vitest'

let groqSignal: AbortSignal | undefined
vi.mock('./groq.js', () => ({
  groqAvailable: () => true,
  recordGroqFallback: vi.fn(),
  chatWithGroqStream: (_m: unknown, _c: unknown, signal: AbortSignal) => {
    groqSignal = signal
    return new Promise(() => {})
  },
}))

const { callProviderStream } = await import('./providers.js')

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
