import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config.js', () => ({
  config: {
    databaseUrl: 'postgres://test',
  },
}))

const queryMock = vi.fn()

vi.mock('./db.js', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

describe('usage metering', () => {
  beforeEach(() => {
    queryMock.mockReset()
    vi.resetModules()
  })

  it('falls back to memory limiter when DB check fails (not unlimited)', async () => {
    queryMock.mockRejectedValueOnce(new Error('db down'))
    const { checkUsage } = await import('./usage.js')
    const result = await checkUsage('user-1', false)
    expect(result.isPro).toBe(false)
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(0)
    expect(result.limit).toBeGreaterThan(0)
  })

  it('bumps memory counter when recordUsage DB write fails', async () => {
    queryMock
      .mockRejectedValueOnce(new Error('insert failed')) // recordUsage
      .mockRejectedValueOnce(new Error('db down')) // subsequent checkUsage

    const { recordUsage, checkUsage } = await import('./usage.js')
    await recordUsage('user-record-fail')
    const result = await checkUsage('user-record-fail', false)
    expect(result.used).toBe(1)
  })

  it('getUsageStats reports the stored revocation reason', async () => {
    const { getUsageStats } = await import('./usage.js')
    const stats = await getUsageStats('user-1', false, 'canceled')
    expect(stats.revocationReason).toBe('canceled')
    expect(stats.isPro).toBe(false)
  })

  it('getUsageStats is silent when no reason is stored', async () => {
    const { getUsageStats } = await import('./usage.js')
    const stats = await getUsageStats('user-1', true, null)
    expect(stats.revocationReason).toBeNull()
    expect(stats.isPro).toBe(true)
    expect(stats.allowed).toBe(true)
  })
})
