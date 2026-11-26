import Stripe from 'stripe'
import { config } from './config.js'
import { resolveUserIdFromPayload, mapStatusToPlan } from './subscriptions.js'

interface CheckoutSession {
  url: string | null
}

/**
 * Stripe API version for SDK calls and the raw Checkout HTTP request.
 *
 * Signature verification (`constructEvent`) does not depend on this value —
 * it only needs the webhook signing secret and the `Stripe-Signature` header.
 * The version matters for request/response shapes on API calls and for how the
 * SDK types event objects after the payload has already been verified.
 *
 * Keep the Checkout `Stripe-Version` header in sync with this constant so the
 * redirect session is created under the same contract as the SDK client.
 *
 * Basil, not the SDK's pinned acacia: the account uses Stripe Managed Payments,
 * which rejects Checkout on versions older than 2025-03-31.basil. The fields this
 * server reads (subscription id/status/created/customer/metadata, customer email,
 * session url) are the same in both versions.
 */
export const STRIPE_API_VERSION = '2025-03-31.basil'

/**
 * Shared Stripe client. Exported so the reconciler can read subscriptions without
 * constructing a second client with a different API version.
 */
export function getStripeClient(): Stripe {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }
  return new Stripe(config.stripeSecretKey, {
    // stripe@17 types accept only its pinned version; the runtime sends any version.
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
  })
}

/**
 * Create a Stripe Checkout session for subscription.
 * Only accepts userId, email, and billing interval — price is server-controlled to prevent spoofing.
 */
/** Create a Stripe Customer tagged with the Clerk user id. */
export async function createStripeCustomer(userId: string, email: string): Promise<string> {
  const customer = await getStripeClient().customers.create({
    email,
    metadata: { userId },
  })
  return customer.id
}

export async function createCheckoutSession(
  userId: string,
  email: string,
  interval: 'monthly' | 'annual' = 'monthly',
  customerId: string,
): Promise<CheckoutSession> {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }
  if (!customerId || !customerId.startsWith('cus_')) {
    throw new Error('Stripe customer id is required for checkout')
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
  params.set('customer', customerId)
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
      'Stripe-Version': STRIPE_API_VERSION,
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

/**
 * Open a Stripe-hosted billing portal session (update card, invoices, cancel).
 * Requires a portal configuration saved in the Stripe Dashboard for the live account.
 */
export async function createBillingPortalSession(customerId: string): Promise<{ url: string }> {
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.appUrl}/app`,
  })
  return { url: session.url }
}

/** The Stripe customer id that owns a subscription. */
export async function getCustomerIdForSubscription(subscriptionId: string): Promise<string> {
  const sub = await getStripeClient().subscriptions.retrieve(subscriptionId)
  return typeof sub.customer === 'string' ? sub.customer : sub.customer.id
}

/** Prefer stored stripeCustomerId; else require a subscription lookup. */
export function resolvePortalCustomerId(meta: {
  stripeCustomerId?: unknown
  stripeSubscriptionId?: unknown
}): { customerId: string | null; needsSubscriptionLookup: boolean } {
  if (typeof meta.stripeCustomerId === 'string' && meta.stripeCustomerId.trim()) {
    return { customerId: meta.stripeCustomerId.trim(), needsSubscriptionLookup: false }
  }
  if (typeof meta.stripeSubscriptionId === 'string' && meta.stripeSubscriptionId.trim()) {
    return { customerId: null, needsSubscriptionLookup: true }
  }
  return { customerId: null, needsSubscriptionLookup: false }
}

export type StripeWebhookEvent = {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

/**
 * Verify Stripe webhook signature via the official SDK.
 *
 * Verification itself is API-version-independent: Stripe signs the raw body,
 * and `constructEvent` checks that signature against `STRIPE_WEBHOOK_SECRET`
 * (including multi-v1 rotation and clock skew). The client's `apiVersion`
 * only affects how the already-verified JSON is typed/normalized afterward.
 * The event schema of the body is controlled by the webhook endpoint's
 * configured API version in the Stripe Dashboard.
 *
 * Throws on failure.
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

  const stripe = getStripeClient()
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

/**
 * Forget an event id so Stripe's retry of a FAILED delivery is processed again.
 * Without this, a failure after `claimWebhookEvent` makes the retry look like a
 * duplicate, answers 200, and drops the purchase until the daily reconcile.
 */
export function releaseWebhookEvent(eventId: string): void {
  seenEventIds.delete(eventId)
}

/** Test helper — clear the dedupe map. */
export function resetWebhookEventDedupe(): void {
  seenEventIds.clear()
}

/**
 * Handle Stripe webhook event (subscription created/updated/deleted).
 * Returns user plan update info, or null if event is irrelevant.
 *
 * User resolution is strict: `client_reference_id` / `metadata.userId`, then
 * Clerk lookup by stored `stripeCustomerId`. Email matching is reconciler-only.
 */
export type StripeWebhookPlanUpdate = {
  userId: string
  plan: 'pro' | 'free'
  stripeSubscriptionId?: string | null
  stripeCustomerId: string | null
  /** Cleared on grant; set on demotion so UI notices match the reconciler. */
  revocationReason: string | null
}

export type WebhookLookupDeps = {
  lookupUserIdByCustomerId?: (customerId: string) => Promise<string | null>
  retrieveSubscription?: (subscriptionId: string) => Promise<{
    id: string
    status: string | null
    customer: string | null
    metadata: Record<string, unknown>
  }>
}

async function resolveWebhookUserId(
  obj: Record<string, unknown>,
  deps?: WebhookLookupDeps,
): Promise<{ userId: string; customerId: string | null } | null> {
  const customerId = typeof obj.customer === 'string' ? obj.customer : null
  const fromPayload = resolveUserIdFromPayload(obj)
  if (fromPayload) return { userId: fromPayload, customerId }
  if (customerId && deps?.lookupUserIdByCustomerId) {
    const userId = await deps.lookupUserIdByCustomerId(customerId)
    if (userId) return { userId, customerId }
  }
  return null
}

export async function handleStripeWebhook(
  event: {
    type: string
    data: { object: Record<string, unknown> }
  },
  deps?: WebhookLookupDeps,
): Promise<StripeWebhookPlanUpdate | null> {
  const obj = event.data.object

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    // Fulfill only paid sessions. `checkout.session.completed` can fire while
    // payment_status is still unpaid for async methods; those complete via
    // `checkout.session.async_payment_succeeded` instead.
    if (event.type === 'checkout.session.completed') {
      const paymentStatus = obj.payment_status
      if (
        paymentStatus !== undefined &&
        paymentStatus !== 'paid' &&
        paymentStatus !== 'no_payment_required'
      ) {
        return null
      }
    }
    const metadata = obj.metadata as Record<string, string> | undefined
    const resolved = await resolveWebhookUserId(obj, deps)
    const stripeSubscriptionId =
      typeof obj.subscription === 'string' ? obj.subscription : metadata?.stripeSubscriptionId
    if (resolved) {
      return {
        userId: resolved.userId,
        plan: 'pro',
        stripeSubscriptionId: stripeSubscriptionId ?? null,
        stripeCustomerId: resolved.customerId,
        revocationReason: null,
      }
    }
  }

  if (event.type === 'customer.subscription.created') {
    const subId = typeof obj.id === 'string' ? obj.id : null
    const resolved = await resolveWebhookUserId(obj, deps)
    if (resolved) {
      return {
        userId: resolved.userId,
        plan: 'pro',
        stripeSubscriptionId: subId,
        stripeCustomerId: resolved.customerId,
        revocationReason: null,
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const resolved = await resolveWebhookUserId(obj, deps)
    if (resolved) {
      return {
        userId: resolved.userId,
        plan: 'free',
        stripeSubscriptionId: null,
        stripeCustomerId: resolved.customerId,
        revocationReason: 'canceled',
      }
    }
  }

  // Handle subscription status changes. Route through the single policy mapper
  // (`mapStatusToPlan`) so the webhook agrees with the reconciler and
  // verifySubscriptionForUser: `past_due`/`trialing` RETAIN Pro (Stripe may still
  // retry the payment), only a definite non-paying status revokes. Hardcoding a
  // revoke list here previously demoted a paying user on `past_due`, contradicting
  // the stated policy until the next reconcile sweep corrected it.
  if (event.type === 'customer.subscription.updated') {
    const status = obj.status as string | undefined
    const resolved = await resolveWebhookUserId(obj, deps)
    if (resolved) {
      const plan = mapStatusToPlan(status)
      const subId = plan === 'pro' && typeof obj.id === 'string' ? obj.id : null
      return {
        userId: resolved.userId,
        plan,
        stripeSubscriptionId: subId,
        stripeCustomerId: resolved.customerId,
        revocationReason: plan === 'pro' ? null : status === 'canceled' ? 'canceled' : 'lapsed',
      }
    }
  }

  if (event.type === 'invoice.paid') {
    const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : null
    if (!subscriptionId || !deps?.retrieveSubscription) return null
    const sub = await deps.retrieveSubscription(subscriptionId)
    if (mapStatusToPlan(sub.status) !== 'pro') return null
    const resolved = await resolveWebhookUserId(
      { customer: sub.customer, metadata: sub.metadata },
      deps,
    )
    if (!resolved) return null
    return {
      userId: resolved.userId,
      plan: 'pro',
      stripeSubscriptionId: sub.id,
      stripeCustomerId: resolved.customerId ?? sub.customer,
      revocationReason: null,
    }
  }

  // Failed renewals leave Pro in place while Stripe retries (past_due policy).
  if (event.type === 'invoice.payment_failed') {
    return null
  }

  return null
}
