/**
 * Unit tests for Stripe integration — webhook signature verification and event handling.
 *
 * Signature verification uses the official Stripe SDK (`constructEvent`). That
 * check is independent of the client's `apiVersion`; the secret + Stripe-Signature
 * header are what matter for accepting or rejecting a delivery.
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
  releaseWebhookEvent,
  resetWebhookEventDedupe,
  resolvePortalCustomerId,
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

describe('resolvePortalCustomerId', () => {
  it('prefers stripeCustomerId for portal', () => {
    expect(
      resolvePortalCustomerId({
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
      }),
    ).toEqual({ customerId: 'cus_1', needsSubscriptionLookup: false })
  })

  it('falls back to subscription lookup when customer id is missing', () => {
    expect(resolvePortalCustomerId({ stripeSubscriptionId: 'sub_1' })).toEqual({
      customerId: null,
      needsSubscriptionLookup: true,
    })
  })
})

describe('handleStripeWebhook', () => {
  describe('checkout.session.completed', () => {
    it('upgrades user to Pro using client_reference_id', async () => {
      const result = await handleStripeWebhook({
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
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

    it('falls back to metadata.userId when client_reference_id is absent', async () => {
      const result = await handleStripeWebhook({
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
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

    it('returns null when no user identifier is present', async () => {
      const result = await handleStripeWebhook({
        type: 'checkout.session.completed',
        data: { object: { metadata: {} } },
      })
      expect(result).toBeNull()
    })

    it('ignores a whitespace-only client_reference_id', async () => {
      const result = await handleStripeWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: ' ',
            subscription: 'sub_a',
            metadata: {},
          },
        },
      })
      // The raw payload would surface a ' ' userId (Clerk rejects that with a 400);
      // resolveUserIdFromPayload trims and treats it as absent.
      expect(result).toBeNull()
    })

    it('skips fulfillment when checkout.session.completed is still unpaid', async () => {
      const result = await handleStripeWebhook({
        type: 'checkout.session.completed',
        data: {
          object: {
            client_reference_id: 'user_async',
            subscription: 'sub_async',
            payment_status: 'unpaid',
            metadata: {},
          },
        },
      })
      expect(result).toBeNull()
    })

    it('fulfills checkout.session.async_payment_succeeded after delayed payment', async () => {
      const result = await handleStripeWebhook({
        type: 'checkout.session.async_payment_succeeded',
        data: {
          object: {
            client_reference_id: 'user_async',
            subscription: 'sub_async',
            payment_status: 'paid',
            metadata: {},
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_async',
        plan: 'pro',
        stripeSubscriptionId: 'sub_async',
        stripeCustomerId: null,
        revocationReason: null,
      })
    })
  })

  describe('customer.subscription.deleted', () => {
    it('downgrades user to free plan', async () => {
      const result = await handleStripeWebhook({
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
        stripeCustomerId: null,
        revocationReason: 'canceled',
      })
    })

    it('returns null when metadata has no userId', async () => {
      const result = await handleStripeWebhook({
        type: 'customer.subscription.deleted',
        data: { object: { metadata: {} } },
      })
      expect(result).toBeNull()
    })
  })

  describe('customer.subscription.updated', () => {
    it('RETAINS Pro on past_due status (Stripe may still retry the payment)', async () => {
      // Policy regression guard: past_due is a PRO_STATUS (see subscriptions.ts).
      // The webhook must agree with the reconciler / verifySubscriptionForUser and
      // not demote a paying user on a dunning retry. A prior hardcoded revoke list
      // wrongly downgraded here.
      const result = await handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_pd',
            status: 'past_due',
            metadata: { userId: 'user_pd' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_pd',
        plan: 'pro',
        stripeSubscriptionId: 'sub_pd',
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

    it('downgrades on canceled status', async () => {
      const result = await handleStripeWebhook({
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
        stripeCustomerId: null,
        revocationReason: 'canceled',
      })
    })

    it('downgrades on unpaid status', async () => {
      const result = await handleStripeWebhook({
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
        stripeCustomerId: null,
        revocationReason: 'lapsed',
      })
    })

    it('restores Pro on active status', async () => {
      const result = await handleStripeWebhook({
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
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

    it('grants Pro on trialing status (trialing is a Pro status)', async () => {
      // trialing is in PRO_STATUSES, so the updated branch now routes it to pro
      // via mapStatusToPlan rather than ignoring it.
      const result = await handleStripeWebhook({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_trial',
            status: 'trialing',
            metadata: { userId: 'user_t' },
          },
        },
      })
      expect(result).toEqual({
        userId: 'user_t',
        plan: 'pro',
        stripeSubscriptionId: 'sub_trial',
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

    it('returns null when metadata has no userId', async () => {
      const result = await handleStripeWebhook({
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

  describe('invoice.paid', () => {
    it('grants pro when the subscription is active and userId is on subscription metadata', async () => {
      const retrieveSubscription = vi.fn(async () => ({
        id: 'sub_inv',
        status: 'active',
        customer: 'cus_inv',
        metadata: { userId: 'user_inv' },
      }))
      const result = await handleStripeWebhook(
        {
          type: 'invoice.paid',
          data: { object: { subscription: 'sub_inv', customer: 'cus_inv' } },
        },
        { retrieveSubscription },
      )
      expect(retrieveSubscription).toHaveBeenCalledWith('sub_inv')
      expect(result).toEqual({
        userId: 'user_inv',
        plan: 'pro',
        stripeSubscriptionId: 'sub_inv',
        stripeCustomerId: 'cus_inv',
        revocationReason: null,
      })
    })

    it('returns null when subscription is not Pro-eligible', async () => {
      const result = await handleStripeWebhook(
        {
          type: 'invoice.paid',
          data: { object: { subscription: 'sub_x', customer: 'cus_x' } },
        },
        {
          retrieveSubscription: async () => ({
            id: 'sub_x',
            status: 'canceled',
            customer: 'cus_x',
            metadata: { userId: 'user_x' },
          }),
        },
      )
      expect(result).toBeNull()
    })
  })

  describe('invoice.payment_failed', () => {
    it('does not demote; returns null (no entitlement write)', async () => {
      const result = await handleStripeWebhook(
        {
          type: 'invoice.payment_failed',
          data: { object: { subscription: 'sub_f', customer: 'cus_f' } },
        },
        {
          retrieveSubscription: async () => ({
            id: 'sub_f',
            status: 'past_due',
            customer: 'cus_f',
            metadata: { userId: 'user_f' },
          }),
        },
      )
      expect(result).toBeNull()
    })
  })

  describe('irrelevant events', () => {
    it('returns null for charge.succeeded', async () => {
      await expect(
        handleStripeWebhook({
          type: 'charge.succeeded',
          data: { object: {} },
        }),
      ).resolves.toBeNull()
    })
  })

  describe('customer.subscription.created', () => {
    it('grants pro for a new subscription carrying userId metadata', async () => {
      const result = await handleStripeWebhook({
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_1', status: 'active', metadata: { userId: 'user_1' } } },
      })
      expect(result).toEqual({
        userId: 'user_1',
        plan: 'pro',
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

        it('resolves subscription.created via stripeCustomerId lookup when metadata.userId is missing', async () => {
      const lookupUserIdByCustomerId = vi.fn(async () => 'user_from_cus')
      const result = await handleStripeWebhook(
        {
          type: 'customer.subscription.created',
          data: { object: { id: 'sub_1', status: 'active', customer: 'cus_1', metadata: {} } },
        },
        { lookupUserIdByCustomerId },
      )
      expect(lookupUserIdByCustomerId).toHaveBeenCalledWith('cus_1')
      expect(result).toEqual({
        userId: 'user_from_cus',
        plan: 'pro',
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: 'cus_1',
        revocationReason: null,
      })
    })

    it('returns null when subscription.created has no userId and customer lookup misses', async () => {
      const result = await handleStripeWebhook(
        {
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_1',
              status: 'active',
              customer: 'cus_1',
              customer_details: { email: 'Owner@Example.com' },
              metadata: {},
            },
          },
        },
        { lookupUserIdByCustomerId: async () => null },
      )
      expect(result).toBeNull()
    })

    it('prefers metadata userId over customer lookup', async () => {
      const lookupUserIdByCustomerId = vi.fn(async () => 'user_email')
      const result = await handleStripeWebhook(
        {
          type: 'customer.subscription.created',
          data: {
            object: {
              id: 'sub_1',
              status: 'active',
              customer: 'cus_1',
              metadata: { userId: 'user_ref' },
            },
          },
        },
        { lookupUserIdByCustomerId },
      )
      expect(lookupUserIdByCustomerId).not.toHaveBeenCalled()
      expect(result).toEqual({
        userId: 'user_ref',
        plan: 'pro',
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: 'cus_1',
        revocationReason: null,
      })
    })

    it('returns null with no userId and no customer lookup deps', async () => {
      const result = await handleStripeWebhook({
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_1',
            status: 'active',
            customer_details: { email: 'Owner@Example.com' },
            metadata: {},
          },
        },
      })
      expect(result).toBeNull()
    })

    it('grants pro on created even when the subscription status is not yet active', async () => {
      // A brand-new subscription event catches a user before Stripe flips it to
      // active; the webhook grants immediately rather than waiting for `updated`.
      const result = await handleStripeWebhook({
        type: 'customer.subscription.created',
        data: {
          object: { id: 'sub_1', status: 'incomplete', metadata: { userId: 'user_created' } },
        },
      })
      expect(result).toEqual({
        userId: 'user_created',
        plan: 'pro',
        stripeSubscriptionId: 'sub_1',
        stripeCustomerId: null,
        revocationReason: null,
      })
    })

  })
})

describe('releaseWebhookEvent', () => {
  it('lets a retried event be claimed again after a failed attempt', () => {
    expect(claimWebhookEvent('evt_retry')).toBe(true)
    expect(claimWebhookEvent('evt_retry')).toBe(false)
    releaseWebhookEvent('evt_retry')
    expect(claimWebhookEvent('evt_retry')).toBe(true)
  })
})

