/**
 * Unit tests for Stripe integration — webhook signature verification and event handling.
 *
 * Signature verification uses the official Stripe SDK (constructEvent).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Stripe from 'stripe'

vi.mock('./config.js', () => ({
  config: {
    stripeSecretKey: 'sk_test_mock',
    stripeWebhookSecret: 'whsec_test_secret',
    stripePriceId: 'price_test',
    appUrl: 'https://test.smartsht.com',
  },
}))

const MOCK_WEBHOOK_SECRET = 'whsec_test_secret'

import {
  verifyWebhookSignature,
  handleStripeWebhook,
  claimWebhookEvent,
  resetWebhookEventDedupe,
} from './stripe'

/** Generate a valid Stripe-Signature header via the SDK (same path as constructEvent). */
function generateSignature(payload: string, secret: string, timestamp?: number): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: timestamp ?? Math.floor(Date.now() / 1000),
  })
}

beforeEach(() => {
  resetWebhookEventDedupe()
})

describe('verifyWebhookSignature', () => {
  it('verifies a valid signature and returns the parsed event', () => {
    const event = {
      id: 'evt_test_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_123' } },
    }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET)

    const result = verifyWebhookSignature(payload, sig)
    expect(result.type).toBe('checkout.session.completed')
    expect(result.id).toBe('evt_test_1')
    expect(result.data.object.id).toBe('cs_123')
  })

  it('rejects a missing signature header', () => {
    const payload = JSON.stringify({ id: 'evt_x', type: 'test', data: { object: {} } })
    expect(() => verifyWebhookSignature(payload, undefined)).toThrow('Missing stripe-signature header')
  })

  it('rejects a malformed signature header', () => {
    const payload = JSON.stringify({ id: 'evt_x', type: 'test', data: { object: {} } })
    expect(() => verifyWebhookSignature(payload, 'v1=abc123')).toThrow()
  })

  it('rejects a replay attack (timestamp too old)', () => {
    const event = { id: 'evt_old', object: 'event', type: 'test', data: { object: {} } }
    const payload = JSON.stringify(event)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET, oldTimestamp)

    expect(() => verifyWebhookSignature(payload, sig)).toThrow()
  })

  it('rejects an invalid signature (wrong secret)', () => {
    const event = { id: 'evt_bad', object: 'event', type: 'test', data: { object: {} } }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, 'whsec_wrong_secret')

    expect(() => verifyWebhookSignature(payload, sig)).toThrow()
  })

  it('rejects a tampered payload', () => {
    const event = { id: 'evt_tamper', object: 'event', type: 'test', data: { object: { amount: 100 } } }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET)

    const tampered = JSON.stringify({
      id: 'evt_tamper',
      object: 'event',
      type: 'test',
      data: { object: { amount: 99999 } },
    })
    expect(() => verifyWebhookSignature(tampered, sig)).toThrow()
  })

  it('accepts a Buffer payload', () => {
    const event = {
      id: 'evt_buf',
      object: 'event',
      type: 'test.event',
      data: { object: { id: 'obj_456' } },
    }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET)

    const result = verifyWebhookSignature(Buffer.from(payload), sig)
    expect(result.type).toBe('test.event')
  })
})

describe('claimWebhookEvent', () => {
  it('allows the first delivery and rejects duplicates', () => {
    expect(claimWebhookEvent('evt_once')).toBe(true)
    expect(claimWebhookEvent('evt_once')).toBe(false)
    expect(claimWebhookEvent('evt_other')).toBe(true)
  })
})

describe('handleStripeWebhook', () => {
  describe('checkout.session.completed', () => {
    it('upgrades user to Pro using client_reference_id', () => {
      const result = handleStripeWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'user_abc123',
            subscription: 'sub_xyz789',
            metadata: {},
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_abc123',
        plan: 'pro',
        stripeSubscriptionId: 'sub_xyz789',
      })
    })

    it('falls back to metadata.userId when client_reference_id is absent', () => {
      const result = handleStripeWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            subscription: 'sub_456',
            metadata: { userId: 'user_from_meta' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_from_meta',
        plan: 'pro',
        stripeSubscriptionId: 'sub_456',
      })
    })

    it('returns null when no user identifier is present', () => {
      const result = handleStripeWebhook({
        type: 'checkout.session.completed',
        data: { object: { metadata: {} } },
      })
      expect(result).toBeNull()
    })
  })

  describe('customer.subscription.deleted', () => {
    it('downgrades user to free plan', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.deleted',
        data: {
          object: {
            metadata: { userId: 'user_del' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_del',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('returns null when metadata has no userId', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.deleted',
        data: { object: { metadata: {} } },
      })
      expect(result).toBeNull()
    })
  })

  describe('customer.subscription.updated', () => {
    it('downgrades on past_due status', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            status: 'past_due',
            metadata: { userId: 'user_pd' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_pd',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('downgrades on canceled status', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            status: 'canceled',
            metadata: { userId: 'user_c' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_c',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('downgrades on unpaid status', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            status: 'unpaid',
            metadata: { userId: 'user_u' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_u',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('restores Pro on active status', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_reactivated',
            status: 'active',
            metadata: { userId: 'user_re' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_re',
        plan: 'pro',
        stripeSubscriptionId: 'sub_reactivated',
      })
    })

    it('returns null for trialing status (no action needed)', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            status: 'trialing',
            metadata: { userId: 'user_t' },
          },
        },
      })
      expect(result).toBeNull()
    })

    it('returns null when metadata has no userId', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            status: 'active',
            metadata: {},
          },
        },
      })
      expect(result).toBeNull()
    })
  })

  describe('irrelevant events', () => {
    it('returns null for unhandled event types', () => {
      expect(
        handleStripeWebhook({
          type: 'invoice.paid',
          data: { object: {} },
        }),
      ).toBeNull()
    })

    it('returns null for charge.succeeded', () => {
      expect(
        handleStripeWebhook({
          type: 'charge.succeeded',
          data: { object: {} },
        }),
      ).toBeNull()
    })
  })
})
