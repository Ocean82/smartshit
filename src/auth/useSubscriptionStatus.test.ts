/**
 * Unit tests for the authoritative sign-on plan check and post-checkout polling.
 *
 * The pure pieces are tested in the node tier (repo has no DOM test
 * environment): the response→status mapping, the API request, and the poll
 * loop. The React hook `useSubscriptionStatus` is a thin wiring layer over them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({
    isSignedIn: true,
    userId: 'user_1',
    getToken: vi.fn(async () => 'tok'),
  }),
  useSession: () => ({ session: { id: 'sess_1' } }),
}))

import {
  planStatusFrom,
  requestPlanStatus,
  createSubscriptionStatusPoller,
  UPGRADE_POLL_ATTEMPTS,
} from './useSubscriptionStatus'

describe('UPGRADE_POLL_ATTEMPTS', () => {
  it('is 10', () => {
    expect(UPGRADE_POLL_ATTEMPTS).toBe(10)
  })
})

describe('planStatusFrom', () => {
  it('reports pro when the server says pro', () => {
    expect(planStatusFrom({ isPro: true, revocationReason: null })).toEqual({
      isPro: true,
      revocationReason: null,
    })
  })

  it('keeps the notice clear while pro, even if a reason is present', () => {
    expect(planStatusFrom({ isPro: true, revocationReason: 'lapsed' })).toEqual({
      isPro: true,
      revocationReason: null,
    })
  })

  it('surfaces a revocation reason when pro is lost', () => {
    expect(planStatusFrom({ isPro: false, revocationReason: 'lapsed' })).toEqual({
      isPro: false,
      revocationReason: 'lapsed',
    })
  })

  it('never sets a revocation reason for an unknown check', () => {
    expect(planStatusFrom({ isPro: false, revocationReason: 'unknown' })).toEqual({
      isPro: false,
      revocationReason: null,
    })
  })

  it('treats a missing revocation reason as null (no notice)', () => {
    expect(planStatusFrom({ isPro: false })).toEqual({ isPro: false, revocationReason: null })
  })
})

describe('requestPlanStatus', () => {
  it('posts the token and returns the parsed plan', async () => {
    const getToken = vi.fn(async () => 'tok')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ isPro: false, revocationReason: 'lapsed' }),
    }))

    const result = await requestPlanStatus(getToken, fetchMock, 'https://api.test')

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    })
    expect(result).toEqual({ ok: true, data: { isPro: false, revocationReason: 'lapsed' } })
  })

  it('does not fetch without a token', async () => {
    const fetchMock = vi.fn()
    const result = await requestPlanStatus(async () => null, fetchMock, 'https://api.test')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ ok: false })
  })

  it('returns not-ok on a non-2xx response without touching state', async () => {
    const getToken = vi.fn(async () => 'tok')
    const result = await requestPlanStatus(
      getToken,
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
      'https://api.test',
    )
    expect(result).toEqual({ ok: false })
  })

  it('returns not-ok when the request throws', async () => {
    const getToken = vi.fn(async () => 'tok')
    const result = await requestPlanStatus(
      getToken,
      vi.fn(async () => {
        throw new Error('network down')
      }),
      'https://api.test',
    )
    expect(result).toEqual({ ok: false })
  })
})

describe('createSubscriptionStatusPoller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('stops as soon as the first check passes', async () => {
    const check = vi.fn(async () => true)
    const onSettled = vi.fn()
    const poller = createSubscriptionStatusPoller(check, { intervalMs: 1000 })

    poller.start(onSettled)
    await vi.advanceTimersByTimeAsync(1000)

    expect(check).toHaveBeenCalledTimes(1)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('polls until pro appears and stops once it does', async () => {
    const answers = [false, false, true]
    const check = vi.fn(async () => answers.shift() ?? true)
    const onSettled = vi.fn()
    const poller = createSubscriptionStatusPoller(check, { intervalMs: 1000 })

    poller.start(onSettled)
    await vi.advanceTimersByTimeAsync(3200)

    expect(check).toHaveBeenCalledTimes(3)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('gives up after the attempt budget and is not stuck confirming', async () => {
    const check = vi.fn(async () => false)
    const onSettled = vi.fn()
    const poller = createSubscriptionStatusPoller(check, {
      intervalMs: 1000,
      maxAttempts: UPGRADE_POLL_ATTEMPTS,
    })

    poller.start(onSettled)
    await vi.advanceTimersByTimeAsync(UPGRADE_POLL_ATTEMPTS * 1000 + 5000)

    expect(check.mock.calls.length).toBeLessThanOrEqual(UPGRADE_POLL_ATTEMPTS)
    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('settles at most once even if checks race', async () => {
    const check = vi.fn(async () => false)
    const onSettled = vi.fn()
    const poller = createSubscriptionStatusPoller(check, { intervalMs: 1000, maxAttempts: 2 })

    poller.start(onSettled)
    await vi.advanceTimersByTimeAsync(10_000)

    expect(onSettled).toHaveBeenCalledTimes(1)
  })

  it('settles at most once when a late check resolves after the budget is hit', async () => {
    const lateResolvers: Array<(v: boolean) => void> = []
    const check = vi.fn(async () => {
      if (check.mock.calls.length === 1) {
        return new Promise<boolean>((resolve) => lateResolvers.push(resolve))
      }
      return false
    })
    const onSettled = vi.fn()
    const poller = createSubscriptionStatusPoller(check, { intervalMs: 1000, maxAttempts: 2 })

    poller.start(onSettled)
    // tick1 fires with a check that stays pending; tick2 resolves false and hits
    // the budget, settling the poller. The first check's late answer must not
    // re-settle it.
    await vi.advanceTimersByTimeAsync(3000)
    expect(onSettled).toHaveBeenCalledTimes(1)

    lateResolvers[0]?.(true)
    await vi.advanceTimersByTimeAsync(0)

    expect(onSettled).toHaveBeenCalledTimes(1)
  })
})