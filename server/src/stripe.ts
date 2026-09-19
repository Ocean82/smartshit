import Stripe from 'stripe'
import { config } from './config.js'

interface CheckoutSession {
  url: string | null
}

/** Lazy Stripe client — checkout still uses raw fetch; webhooks use the SDK. */
function getStripe(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }
  return new Stripe(config.stripeSecretKey, {
    apiVersion: '2025-02-24.acacia',
  })
}

/**
 * Create a Stripe Checkout session for subscription.
 * Only accepts userId, email, and billing interval — price is server-controlled to prevent spoofing.
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  interval: 'monthly' | 'annual' = 'monthly',
): Promise<CheckoutSession> {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }

  const priceId = interval === 'annual' ? config.stripePriceIdAnnual : config.stripePriceId

  if (!priceId) {
    throw new Error(
      interval === 'annual'
        ? 'STRIPE_PRICE_ID_ANNUAL not configured — set the annual Pro price ID'
        : 'STRIPE_PRICE_ID not configured — set the live Pro price ID',
    )
  }
  if (!priceId.startsWith('price_')) {
    throw new Error(`STRIPE_PRICE_ID${interval === 'annual' ? '_ANNUAL' : ''} must be a Stripe price id (price_…)`)
  }

  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  params.set('success_url', `${config.appUrl}/app?upgraded=true`)
  params.set('cancel_url', `${config.appUrl}/app`)
  params.set('customer_email', email)
  params.set('client_reference_id', userId)
  // Always use the server-configured price — never trust client input
  params.set('line_items[0][price]', priceId)
  params.set('line_items[0][quantity]', '1')
  params.set('metadata[userId]', userId)
  params.set('metadata[interval]', interval)
  // CRITICAL: Set userId on the subscription itself so webhooks
  // (customer.subscription.deleted/updated) can identify the user.
  params.set('subscription_data[metadata][userId]', userId)

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stripe checkout failed (${res.status}): ${text}`)
  }

  const session = (await res.json()) as { url: string | null }
  return { url: session.url }
}

export type StripeWebhookEvent = {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/**
 * Verify Stripe webhook signature via the official SDK (handles multi-v1
 * rotation, clock skew, and payload parsing). Throws on failure.
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signatureHeader: string | undefined,
): StripeWebhookEvent {
  if (!config.stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured — cannot verify webhook')
  }

  if (!signatureHeader) {
    throw new Error('Missing stripe-signature header')
  }

  const stripe = getStripe()
  const event = stripe.webhooks.constructEvent(
    payload,
    signatureHeader,
    config.stripeWebhookSecret,
  )

  return {
    id: event.id,
    type: event.type,
    data: { object: event.data.object as unknown as Record<string, unknown> },
  }
}

// ─── Event-id dedupe (in-process; sufficient for single-instance PM2) ────────

const SEEN_EVENT_TTL_MS = 24 * 60 * 60 * 1000
const seenEventIds = new Map<string, number>()

function pruneSeenEvents(now: number): void {
  for (const [id, at] of seenEventIds) {
    if (now - at > SEEN_EVENT_TTL_MS) seenEventIds.delete(id)
  }
}

/**
 * Returns true the first time this event id is seen (process it).
 * Returns false on replay within the TTL window (skip side effects).
 */
export function claimWebhookEvent(eventId: string): boolean {
  const now = Date.now()
  pruneSeenEvents(now)
  if (seenEventIds.has(eventId)) return false
  seenEventIds.set(eventId, now)
  return true
}

/** Test helper — clear the dedupe map. */
export function resetWebhookEventDedupe(): void {
  seenEventIds.clear()
}

/**
 * Handle Stripe webhook event (subscription created/updated/deleted).
 * Returns user plan update info, or null if event is irrelevant.
 */
export function handleStripeWebhook(event: {
  type: string
  data: { object: Record<string, unknown> }
}): { userId: string; plan: 'pro' | 'free'; stripeSubscriptionId?: string | null } | null {
  const obj = event.data.object

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const metadata = obj.metadata as Record<string, string> | undefined
    const userId = (obj.client_reference_id as string) ?? metadata?.userId
    const stripeSubscriptionId =
      typeof obj.subscription === 'string' ? obj.subscription : metadata?.stripeSubscriptionId
    if (userId) {
      return { userId, plan: 'pro', stripeSubscriptionId: stripeSubscriptionId ?? null }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const metadata = obj.metadata as Record<string, string> | undefined
    const userId = metadata?.userId
    if (userId) {
      return { userId, plan: 'free', stripeSubscriptionId: null }
    }
  }

  // Handle subscription status changes (past_due, canceled, unpaid)
  if (event.type === 'customer.subscription.updated') {
    const metadata = obj.metadata as Record<string, string> | undefined
    const userId = metadata?.userId
    const status = obj.status as string | undefined
    if (userId && (status === 'past_due' || status === 'canceled' || status === 'unpaid')) {
      return { userId, plan: 'free', stripeSubscriptionId: null }
    }
    // If subscription is re-activated (active), restore Pro
    if (userId && status === 'active') {
      const subId = typeof obj.id === 'string' ? obj.id : null
      return { userId, plan: 'pro', stripeSubscriptionId: subId }
    }
  }

  return null
}
