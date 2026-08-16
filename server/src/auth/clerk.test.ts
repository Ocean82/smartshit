import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { getAuth } from '@clerk/express'
import { planFromPublicMetadata, requireAuth, hasClerkUserId } from './clerk.js'

vi.mock('@clerk/express', () => ({
  getAuth: vi.fn(),
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

describe('requireAuth', () => {
  let res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }
  let next: NextFunction

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    next = vi.fn()
  })

  it('returns 401 when Clerk auth has no userId', () => {
    getAuthMock.mockReturnValue({ userId: null } as ReturnType<typeof getAuth>)
    requireAuth({} as Request, res as unknown as Response, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next when userId is set even if isAuthenticated is undefined', () => {
    getAuthMock.mockReturnValue({ userId: 'user_abc' } as ReturnType<typeof getAuth>)
    requireAuth({} as Request, res as unknown as Response, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })
})
