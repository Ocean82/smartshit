import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config.js', () => ({
  config: {
    clerkSecretKey: 'sk_test',
  },
}))

const getUserMock = vi.fn()

vi.mock('./auth/clerk.js', () => ({
  planFromPublicMetadata: (meta: Record<string, unknown> | null | undefined) =>
    meta && (meta.plan === 'pro' || meta.stripeSubscriptionId) ? 'pro' : 'free',
  getClerkClient: () => ({
    users: { getUser: (...args: unknown[]) => getUserMock(...args) },
  }),
}))

describe('resolveSubscriptionStatus', () => {
  beforeEach(() => {
    getUserMock.mockReset()
    vi.resetModules()
  })

  it('reports the stored reason for a revoked user', async () => {
    getUserMock.mockResolvedValueOnce({ publicMetadata: { plan: 'free', revocationReason: 'canceled' } })
    const { resolveSubscriptionStatus } = await import('./plan.js')
    await expect(resolveSubscriptionStatus('user-1')).resolves.toEqual({
      isPro: false,
      revocationReason: 'canceled',
    })
  })

  it('is silent when the user is pro', async () => {
    getUserMock.mockResolvedValueOnce({ publicMetadata: { plan: 'pro', revocationReason: null } })
    const { resolveSubscriptionStatus } = await import('./plan.js')
    await expect(resolveSubscriptionStatus('user-1')).resolves.toEqual({
      isPro: true,
      revocationReason: null,
    })
  })

  it('normalizes a stored unknown reason to null so an outage never surfaces', async () => {
    getUserMock.mockResolvedValueOnce({ publicMetadata: { plan: 'free', revocationReason: 'unknown' } })
    const { resolveSubscriptionStatus } = await import('./plan.js')
    await expect(resolveSubscriptionStatus('user-1')).resolves.toEqual({
      isPro: false,
      revocationReason: null,
    })
  })

  it('keeps pro independent of a stale stored reason', async () => {
    getUserMock.mockResolvedValueOnce({ publicMetadata: { plan: 'pro', revocationReason: 'canceled' } })
    const { resolveSubscriptionStatus } = await import('./plan.js')
    await expect(resolveSubscriptionStatus('user-1')).resolves.toEqual({
      isPro: true,
      revocationReason: 'canceled',
    })
  })

  it('caches per user and does not re-fetch within the cache window', async () => {
    getUserMock.mockResolvedValue({ publicMetadata: { plan: 'free', revocationReason: 'lapsed' } })
    const { resolveSubscriptionStatus } = await import('./plan.js')
    await resolveSubscriptionStatus('user-1')
    await resolveSubscriptionStatus('user-1')
    expect(getUserMock).toHaveBeenCalledTimes(1)
  })

  it('returns the cached status when Clerk is unreachable after the cache expires', async () => {
    vi.useFakeTimers()
    try {
      getUserMock
        .mockResolvedValueOnce({ publicMetadata: { plan: 'free', revocationReason: 'paused' } })
        .mockRejectedValueOnce(new Error('clerk down'))
      const { resolveSubscriptionStatus } = await import('./plan.js')
      await resolveSubscriptionStatus('user-1')
      vi.advanceTimersByTime(5 * 60 * 1000 + 1)
      await expect(resolveSubscriptionStatus('user-1')).resolves.toEqual({
        isPro: false,
        revocationReason: 'paused',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails open to not-pro without a reason on first fetch when Clerk is down', async () => {
    getUserMock.mockRejectedValueOnce(new Error('clerk down'))
    const { resolveSubscriptionStatus } = await import('./plan.js')
    await expect(resolveSubscriptionStatus('user-1')).resolves.toEqual({
      isPro: false,
      revocationReason: null,
    })
  })

  it('resolveIsPro still returns a plain boolean', async () => {
    getUserMock.mockResolvedValue({ publicMetadata: { plan: 'pro', revocationReason: null } })
    const { resolveIsPro } = await import('./plan.js')
    await expect(resolveIsPro('user-1')).resolves.toBe(true)
  })
})