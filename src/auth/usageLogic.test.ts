import { describe, expect, it } from 'vitest'
import { anonymousUsageState, computeIsPro, shouldFetchPlan } from './usageLogic'

describe('anonymousUsageState (T10)', () => {
  it('is free-tier, can ask, zero used for anonymous and pending', () => {
    for (const s of ['anonymous', 'pending'] as const) {
      const st = anonymousUsageState(s, 7)!
      expect(st.isPro).toBe(false)
      expect(st.canAsk).toBe(true)
      expect(st.usedToday).toBe(0)
      expect(st.remaining).toBe(Infinity)
    }
  })
  it('is null for signed-in and dev', () => {
    expect(anonymousUsageState('signed-in', 7)).toBeNull()
    expect(anonymousUsageState('dev', 7)).toBeNull()
  })
})

describe('computeIsPro (T10)', () => {
  const base = { claimsPro: false, serverIsPro: null, hasByok: true }
  it('BYOK cannot make an anonymous or pending visitor look unlimited', () => {
    expect(computeIsPro({ ...base, status: 'anonymous' })).toBe(false)
    expect(computeIsPro({ ...base, status: 'pending' })).toBe(false)
  })
  it('BYOK counts for signed-in and dev', () => {
    expect(computeIsPro({ ...base, status: 'signed-in' })).toBe(true)
    expect(computeIsPro({ ...base, status: 'dev' })).toBe(true)
  })
  it('claims or server pro always count', () => {
    expect(computeIsPro({ status: 'signed-in', claimsPro: true, serverIsPro: null, hasByok: false })).toBe(true)
    expect(computeIsPro({ status: 'signed-in', claimsPro: false, serverIsPro: true, hasByok: false })).toBe(true)
  })
})

describe('shouldFetchPlan (T10b)', () => {
  const ok = { status: 'signed-in' as const, claimsPro: false, hasByok: false, inFlight: false, done: false }
  it('never for anonymous, pending or dev (getToken is never called)', () => {
    for (const status of ['anonymous', 'pending', 'dev'] as const) {
      expect(shouldFetchPlan({ ...ok, status })).toBe(false)
    }
  })
  it('true for signed-in, including after an earlier anonymous false (no latch)', () => {
    expect(shouldFetchPlan({ ...ok, status: 'anonymous' })).toBe(false)
    expect(shouldFetchPlan(ok)).toBe(true)
  })
  it('false when in flight, done, claimsPro or hasByok', () => {
    expect(shouldFetchPlan({ ...ok, inFlight: true })).toBe(false)
    expect(shouldFetchPlan({ ...ok, done: true })).toBe(false)
    expect(shouldFetchPlan({ ...ok, claimsPro: true })).toBe(false)
    expect(shouldFetchPlan({ ...ok, hasByok: true })).toBe(false)
  })
})