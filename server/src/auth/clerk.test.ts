import { describe, it, expect } from 'vitest'
import { planFromPublicMetadata } from './clerk.js'

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
