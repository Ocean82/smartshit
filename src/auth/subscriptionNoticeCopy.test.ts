import { describe, it, expect } from 'vitest'
import { subscriptionNoticeCopy } from './subscriptionNoticeCopy'

describe('subscriptionNoticeCopy', () => {
  it('explains a cancellation', () => {
    expect(subscriptionNoticeCopy('canceled')).toMatchObject({
      message: expect.stringMatching(/canceled/i),
      action: 'Resubscribe',
    })
  })

  it('returns no href, so the CTA cannot be a dead link', () => {
    // The action used to point at `/app#upgrade`, which nothing handles. It is now
    // a button that calls the real checkout endpoint, so copy carries no link.
    for (const reason of ['canceled', 'unpaid', 'incomplete', 'paused', 'lapsed']) {
      expect(subscriptionNoticeCopy(reason), reason).not.toHaveProperty('href')
    }
  })

  it('explains a failed payment', () => {
    expect(subscriptionNoticeCopy('unpaid')).toMatchObject({
      message: expect.stringMatching(/payment/i),
      action: 'Update payment method',
    })
  })

  it('explains an inactive subscription for any not-yet-active status', () => {
    for (const reason of ['incomplete', 'incomplete_expired', 'paused']) {
      expect(subscriptionNoticeCopy(reason), reason).toMatchObject({
        message: expect.stringMatching(/isn't active yet/i),
      })
    }
  })

  it('explains a lapsed subscription', () => {
    expect(subscriptionNoticeCopy('lapsed')).toMatchObject({
      message: expect.stringMatching(/no longer active/i),
      action: 'Resubscribe',
    })
  })

  it('renders nothing for an unknown reason, so a Stripe outage stays silent', () => {
    expect(subscriptionNoticeCopy('unknown')).toBeNull()
  })

  it('renders nothing when there is no reason', () => {
    expect(subscriptionNoticeCopy('')).toBeNull()
    expect(subscriptionNoticeCopy(null)).toBeNull()
    expect(subscriptionNoticeCopy(undefined)).toBeNull()
  })
})