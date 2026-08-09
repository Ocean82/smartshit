/**
 * Unit tests for Stripe integration — webhook signature verification and event handling.
 *
 * These tests validate:
 * - Webhook signature verification (HMAC-SHA256 with timing-safe comparison)
 * - Replay protection (timestamp tolerance)
 * - Event routing for checkout.session.completed, subscription.deleted, subscription.updated
 * - Edge cases (missing metadata, irrelevant events, malformed headers)
 */

import crypto from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock config before importing stripe module ──────────────────────────────

vi.mock('./config.js', () => ({
  config: {
    stripeSecretKey: 'sk_test_mock',
    stripeWebhookSecret: 'whsec_test_secret_key_123',
    stripePriceId: 'price_test',
    appUrl: 'https://test.smartsht.com',
  },
}))

const MOCK_WEBHOOK_SECRET = 'whsec_test_secret_key_123'

import { verifyWebhookSignature, handleStripeWebhook } from './stripe'

/** Generate a valid Stripe signature header for a given payload. */
function generateSignature(payload: string, secret: string, timestamp?: number): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000)
  const signedPayload = `${ts}.${payload}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload, 'utf8')
    .digest('hex')
  return `t=${ts},v1=${signature}`
}

// ─── Webhook Signature Verification ─────────────────────────────────────────

describe('verifyWebhookSignature', () => {

  it('verifies a valid signature and returns the parsed event', () => {
    const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET)

    // Need to re-import with the mocked env. Since config is loaded at module init,
    // we test the function signature behavior directly.
    // For unit testing, we'll verify the crypto logic by creating valid signatures.
    const result = verifyWebhookSignature(payload, sig)
    expect(result.type).toBe('checkout.session.completed')
    expect(result.data.object.id).toBe('cs_123')
  })

  it('rejects a missing signature header', () => {
    const payload = JSON.stringify({ type: 'test', data: { object: {} } })
    expect(() => verifyWebhookSignature(payload, undefined)).toThrow('Missing stripe-signature header')
  })

  it('rejects a malformed signature header (no timestamp)', () => {
    const payload = JSON.stringify({ type: 'test', data: { object: {} } })
    expect(() => verifyWebhookSignature(payload, 'v1=abc123')).toThrow('Invalid stripe-signature header format')
  })

  it('rejects a malformed signature header (no v1 signature)', () => {
    const payload = JSON.stringify({ type: 'test', data: { object: {} } })
    expect(() => verifyWebhookSignature(payload, 't=1234567890')).toThrow('Invalid stripe-signature header format')
  })

  it('rejects a replay attack (timestamp too old)', () => {
    const event = { type: 'test', data: { object: {} } }
    const payload = JSON.stringify(event)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600 // 10 minutes ago
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET, oldTimestamp)

    expect(() => verifyWebhookSignature(payload, sig)).toThrow('Webhook timestamp too old')
  })

  it('rejects an invalid signature (wrong secret)', () => {
    const event = { type: 'test', data: { object: {} } }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, 'wrong_secret')

    expect(() => verifyWebhookSignature(payload, sig)).toThrow('Webhook signature verification failed')
  })

  it('rejects a tampered payload', () => {
    const event = { type: 'test', data: { object: { amount: 100 } } }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET)

    // Tamper with the payload after signing
    const tampered = JSON.stringify({ type: 'test', data: { object: { amount: 99999 } } })
    expect(() => verifyWebhookSignature(tampered, sig)).toThrow('Webhook signature verification failed')
  })

  it('accepts a Buffer payload', () => {
    const event = { type: 'test.event', data: { object: { id: 'obj_456' } } }
    const payload = JSON.stringify(event)
    const sig = generateSignature(payload, MOCK_WEBHOOK_SECRET)

    const result = verifyWebhookSignature(Buffer.from(payload), sig)
    expect(result.type).toBe('test.event')
  })
})

// ─── Webhook Event Handling ─────────────────────────────────────────────────

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
            client_reference_id: undefined as unknown as string,
            subscription: 'sub_456',
            metadata: { userId: 'user_fallback' },
          },
        },
      })

      expect(result).toEqual({
        userId: 'user_fallback',
        plan: 'pro',
        stripeSubscriptionId: 'sub_456',
      })
    })

    it('returns null when no user identifier is present', () => {
      const result = handleStripeWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: undefined as unknown as string,
            metadata: {},
          },
        },
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
            id: 'sub_canceled',
            metadata: { userId: 'user_downgrade' },
          },
        },
      })

      expect(result).toEqual({
        userId: 'user_downgrade',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('returns null when metadata has no userId', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_orphan', metadata: {} } },
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
            id: 'sub_pastdue',
            status: 'past_due',
            metadata: { userId: 'user_pastdue' },
          },
        },
      })

      expect(result).toEqual({
        userId: 'user_pastdue',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('downgrades on canceled status', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_canceled',
            status: 'canceled',
            metadata: { userId: 'user_canceled' },
          },
        },
      })

      expect(result).toEqual({
        userId: 'user_canceled',
        plan: 'free',
        stripeSubscriptionId: null,
      })
    })

    it('downgrades on unpaid status', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_unpaid',
            status: 'unpaid',
            metadata: { userId: 'user_unpaid' },
          },
        },
      })

      expect(result).toEqual({
        userId: 'user_unpaid',
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
            metadata: { userId: 'user_reactivated' },
          },
        },
      })

      expect(result).toEqual({
        userId: 'user_reactivated',
        plan: 'pro',
        stripeSubscriptionId: 'sub_reactivated',
      })
    })

    it('returns null for trialing status (no action needed)', () => {
      const result = handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_trial',
            status: 'trialing',
            metadata: { userId: 'user_trial' },
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
            id: 'sub_noid',
            status: 'past_due',
            metadata: {},
          },
        },
      })

      expect(result).toBeNull()
    })
  })

  describe('irrelevant events', () => {
    it('returns null for unhandled event types', () => {
      const result = handleStripeWebhook({
        type: 'invoice.paid',
        data: { object: { id: 'inv_123' } },
      })

      expect(result).toBeNull()
    })

    it('returns null for charge.succeeded', () => {
      const result = handleStripeWebhook({
        type: 'charge.succeeded',
        data: { object: { id: 'ch_123', amount: 700 } },
      })

      expect(result).toBeNull()
    })
  })
})
