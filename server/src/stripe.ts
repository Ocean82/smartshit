import crypto from 'node:crypto'
import { config } from './config.js'

interface CheckoutSession {
  url: string | null
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

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 * Returns the parsed event if valid, throws if verification fails.
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signatureHeader: string | undefined,
): { type: string; data: { object: Record<string, unknown> } } {
  if (!config.stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured — cannot verify webhook')
  }

  if (!signatureHeader) {
    throw new Error('Missing stripe-signature header')
  }

  // Parse the signature header: t=timestamp,v1=signature[,v1=...]
  // Stripe sends multiple v1= values during signing-secret rotation — accept any.
  const elements = signatureHeader.split(',')
  const timestampStr = elements.find((e) => e.startsWith('t='))?.slice(2)
  const signatures = elements
    .filter((e) => e.startsWith('v1='))
    .map((e) => e.slice(3))
    .filter(Boolean)

  if (!timestampStr || signatures.length === 0) {
    throw new Error('Invalid stripe-signature header format')
  }

  const timestamp = parseInt(timestampStr, 10)

  // Reject if timestamp is outside ±5 minutes (replay + clock-skew / future stamps)
  const tolerance = 300 // 5 minutes
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > tolerance) {
    throw new Error('Webhook timestamp outside tolerance — possible replay attack')
  }

  // Compute expected signature
  const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf8')
  const signedPayload = `${timestampStr}.${payloadStr}`
  const expectedSignature = crypto
    .createHmac('sha256', config.stripeWebhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex')

  const expectedBuffer = Buffer.from(expectedSignature, 'hex')
  const matched = signatures.some((signature) => {
    const sigBuffer = Buffer.from(signature, 'hex')
    return (
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    )
  })

  if (!matched) {
    throw new Error('Webhook signature verification failed')
  }

  // Signature valid — parse the event
  const event = JSON.parse(payloadStr) as { type: string; data: { object: Record<string, unknown> } }
  return event
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
