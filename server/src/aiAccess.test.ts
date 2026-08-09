import { describe, expect, it } from 'vitest'
import { decideAiAccess, shouldRecordServerUsage } from './aiAccess.js'

describe('decideAiAccess', () => {
  it('allows Pro users unlimited server inference', () => {
    expect(
      decideAiAccess({
        isPro: true,
        usageAllowed: false,
        hasByokCredentials: false,
        dailyLimit: 3,
      }),
    ).toEqual({ allowed: true, byokOnly: false })
  })

  it('allows free users under quota to use server providers', () => {
    expect(
      decideAiAccess({
        isPro: false,
        usageAllowed: true,
        hasByokCredentials: false,
        dailyLimit: 3,
      }),
    ).toEqual({ allowed: true, byokOnly: false })
  })

  it('denies free users over quota without BYOK credentials', () => {
    const decision = decideAiAccess({
      isPro: false,
      usageAllowed: false,
      hasByokCredentials: false,
      dailyLimit: 3,
    })
    expect(decision.allowed).toBe(false)
    expect(decision.byokOnly).toBe(false)
    expect(decision.denialMessage).toContain('3 free AI questions')
  })

  it('allows over-quota free users with BYOK credentials, but BYOK-only', () => {
    // Critical: credentials alone must NOT unlock server-funded providers
    expect(
      decideAiAccess({
        isPro: false,
        usageAllowed: false,
        hasByokCredentials: true,
        dailyLimit: 3,
      }),
    ).toEqual({ allowed: true, byokOnly: true })
  })

  it('does not treat under-quota + BYOK as byokOnly (server fallthrough OK)', () => {
    expect(
      decideAiAccess({
        isPro: false,
        usageAllowed: true,
        hasByokCredentials: true,
        dailyLimit: 3,
      }),
    ).toEqual({ allowed: true, byokOnly: false })
  })
})

describe('shouldRecordServerUsage', () => {
  it('meters free users when a server provider answered', () => {
    expect(shouldRecordServerUsage({ usedServerProvider: true, isPro: false })).toBe(true)
  })

  it('does not meter Pro users', () => {
    expect(shouldRecordServerUsage({ usedServerProvider: true, isPro: true })).toBe(false)
  })

  it('does not meter successful BYOK (no server provider)', () => {
    expect(shouldRecordServerUsage({ usedServerProvider: false, isPro: false })).toBe(false)
  })
})
