import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerHealth } from './agentClient'
import { fetchServerHealth } from './agentClient'
import {
  getServerHealthSnapshot,
  resetServerHealthForTests,
  subscribeServerHealth,
} from './serverHealth'

vi.mock('./agentClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./agentClient')>()
  return {
    ...actual,
    fetchServerHealth: vi.fn(),
  }
})

const fetchHealth = vi.mocked(fetchServerHealth)

const healthy: ServerHealth = {
  ok: true,
  ollama: true,
  modelRegistered: true,
  modelName: 'test',
  groq: true,
}

const offline: ServerHealth = {
  ok: false,
  ollama: false,
  modelRegistered: false,
  modelName: '',
}

describe('subscribeServerHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fetchHealth.mockReset()
    resetServerHealthForTests()
  })

  afterEach(() => {
    resetServerHealthForTests()
    vi.useRealTimers()
  })

  it('shares one in-flight fetch across subscribers', async () => {
    fetchHealth.mockResolvedValue(healthy)
    const a = vi.fn()
    const b = vi.fn()

    subscribeServerHealth(a)
    subscribeServerHealth(b)

    expect(fetchHealth).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(getServerHealthSnapshot()).toEqual(healthy)
    expect(a).toHaveBeenCalledWith(healthy)
    expect(b).toHaveBeenCalledWith(healthy)
  })

  it('does not start a second poller while a subscriber is active', async () => {
    fetchHealth.mockResolvedValue(healthy)
    const unsub = subscribeServerHealth(() => {})
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchHealth).toHaveBeenCalledTimes(1)

    subscribeServerHealth(() => {})
    expect(fetchHealth).toHaveBeenCalledTimes(1)

    unsub()
  })

  it('does not refetch when the last subscriber remounts within the grace window', async () => {
    fetchHealth.mockResolvedValue(healthy)
    const unsub = subscribeServerHealth(() => {})
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchHealth).toHaveBeenCalledTimes(1)

    unsub()
    subscribeServerHealth(() => {})
    await Promise.resolve()
    await Promise.resolve()

    expect(fetchHealth).toHaveBeenCalledTimes(1)
  })

  it('stops polling when the last subscriber unsubscribes', async () => {
    fetchHealth.mockResolvedValue(healthy)
    const unsub = subscribeServerHealth(() => {})
    await Promise.resolve()
    await Promise.resolve()
    unsub()

    fetchHealth.mockClear()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchHealth).not.toHaveBeenCalled()
  })

  it('backs off when health is not ok', async () => {
    fetchHealth.mockResolvedValue(offline)
    subscribeServerHealth(() => {})
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchHealth).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetchHealth).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchHealth).toHaveBeenCalledTimes(2)
  })
})
