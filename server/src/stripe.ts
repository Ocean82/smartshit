import { config } from './config.js'

interface CheckoutRequestBody {
  userId: string
  email: string
  priceId: string
}

interface CheckoutSession {
  url: string | null
}

/**
 * Create a Stripe Checkout session for subscription.
 * Returns the checkout URL to redirect the user to.
 */
export async function createCheckoutSession(body: CheckoutRequestBody): Promise<CheckoutSession> {
  if (!config.stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY not configured')
  }

  const params = new URLSearchParams()
  params.set('mode', 'subscription')
  params.set('success_url', `${config.appUrl}/app?upgraded=true`)
  params.set('cancel_url', `${config.appUrl}/app`)
  params.set('customer_email', body.email)
  params.set('client_reference_id', body.userId)
  params.set('line_items[0][price]', body.priceId)
  params.set('line_items[0][quantity]', '1')
  params.set('metadata[userId]', body.userId)

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
 * Handle Stripe webhook event (subscription created/updated/deleted).
 * Updates the user's plan status.
 */
export async function handleStripeWebhook(event: {
  type: string
  data: { object: Record<string, unknown> }
}): Promise<{ userId: string; plan: string } | null> {
  const obj = event.data.object

  if (event.type === 'checkout.session.completed') {
    const metadata = obj.metadata as Record<string, string> | undefined
    const userId = (obj.client_reference_id as string) ?? metadata?.userId
    if (userId) {
      // Update Clerk user metadata with subscription info
      return { userId, plan: 'pro' }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const metadata = obj.metadata as Record<string, string> | undefined
    const userId = metadata?.userId
    if (userId) {
      return { userId, plan: 'free' }
    }
  }

  return null
}
