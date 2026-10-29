import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { getAuth } from '@clerk/express'
import { planFromPublicMetadata, requireAuth, hasClerkUserId, clerkConfigHealth } from './clerk.js'
import { getAuthMetrics, resetAuthMetrics } from './authMetrics.js'

vi.mock('@clerk/express', () => ({
  getAuth: vi.fn(),
}))

vi.mock('../config.js', () => ({
  config: {
    clerkSecretKey: 'sk_test',
    clerkPublishableKey: 'pk_test',
    clerkAuthorizedParties: ['https://smartsht.com', 'https://www.smartsht.com'],
  },
}))

const getAuthMock = vi.mocked(getAuth)

describe('planFromPublicMetadata', () => {
  it('returns pro when plan is pro', () => {
    expect(planFromPublicMetadata({ plan: 'pro' })).toBe('pro')
  })
  it('returns pro when stripeSubscriptionId present', () => {
    expect(planFromPublicMetadata({ stripeSubscriptionId: 'sub_x' })).toBe('pro')
  })
  it('returns free otherwise', () => {
    expect(planFromPublicMetadata({})).toBe('free')
    expect(planFromPublicMetadata(undefined)).toBe('free')
  })
  it('denies pro when the plan is free and no subscription id is stored', () => {
    // The exact shape writeClerkPlan persists on a demotion. A non-null id here would
    // re-grant Pro on the next read and make the write a no-op in practice.
    expect(planFromPublicMetadata({ plan: 'free', stripeSubscriptionId: null })).toBe('free')
  })
  it('denies pro when the plan is free even if a reason is recorded', () => {
    expect(planFromPublicMetadata({ plan: 'free', revocationReason: 'canceled' })).toBe('free')
  })
})

describe('hasClerkUserId', () => {
  it('is false when userId is missing even if isAuthenticated is undefined', () => {
    expect(hasClerkUserId({})).toBe(false)
    expect(hasClerkUserId({ userId: null })).toBe(false)
  })
  it('is true when userId is present', () => {
    expect(hasClerkUserId({ userId: 'user_123' })).toBe(true)
  })
})

describe('clerkConfigHealth', () => {
  it('reports configured secret, publishable key, and authorized party count', () => {
    const health = clerkConfigHealth()
    expect(health).toMatchObject({
      ok: true,
      mode: 'config',
      publishableKeyConfigured: true,
      authorizedPartyCount: 2,
    })
  })
})

describe('requireAuth', () => {
  let res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
  let next: NextFunction

  beforeEach(() => {
    resetAuthMetrics()
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    next = vi.fn()
  })

  it('returns 401 when Clerk auth has no userId', () => {
    getAuthMock.mockReturnValue({ userId: null } as ReturnType<typeof getAuth>)
    requireAuth({ path: '/api/usage', headers: {} } as Request, res as unknown as Response, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
    expect(getAuthMetrics()).toMatchObject({
      denials: 1,
      lastDenialReason: 'no_bearer',
      lastDenialPath: '/api/usage',
    })
  })

  it('records no_session when a Bearer token is present but Clerk has no userId', () => {
    getAuthMock.mockReturnValue({ userId: null } as ReturnType<typeof getAuth>)
    requireAuth(
      { path: '/api/checkout', headers: { authorization: 'Bearer eyJhbGciOi...' } } as Request,
      res as unknown as Response,
      next,
    )
    expect(res.status).toHaveBeenCalledWith(401)
    expect(getAuthMetrics().lastDenialReason).toBe('no_session')
    expect(getAuthMetrics().byReason.no_session).toBe(1)
  })

  it('calls next when userId is set even if isAuthenticated is undefined', () => {
    getAuthMock.mockReturnValue({ userId: 'user_abc' } as ReturnType<typeof getAuth>)
    requireAuth({ path: '/api/usage', headers: {} } as Request, res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
    expect(getAuthMetrics().denials).toBe(0)
  })
})
