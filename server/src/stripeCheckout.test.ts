/**
 * createCheckoutSession request contract. The live account uses Stripe Managed
 * Payments, which rejects Checkout on API versions older than 2025-03-31.basil
 * (that rejection was a production 500 on every Upgrade click).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('./config.js', () => ({
  config: {
    stripeSecretKey: 'sk_test_mock',
    stripePriceId: 'price_monthly',
    stripePriceIdAnnual: 'price_annual',
    appUrl: 'https://test.smartsht.com',
  },
}))

import { createCheckoutSession, STRIPE_API_VERSION } from './stripe'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function captureFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_x' }), { status: 200 }),
  )
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return () => {
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    return { url, headers: init.headers as Record<string, string>, body: new URLSearchParams(String(init.body)) }
  }
}

describe('createCheckoutSession', () => {
  it('uses an API version that Managed Payments accepts (basil or later)', async () => {
    const call = captureFetch()
    await createCheckoutSession('user_1', 'a@b.com', 'monthly')
    const { headers } = call()
    expect(headers['Stripe-Version']).toBe(STRIPE_API_VERSION)
    expect(STRIPE_API_VERSION >= '2025-03-31').toBe(true)
  })

  it('sends the server-configured price for the interval and tags the user on session and subscription', async () => {
    const call = captureFetch()
    const session = await createCheckoutSession('user_1', 'a@b.com', 'annual')
    const { url, body } = call()
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(body.get('line_items[0][price]')).toBe('price_annual')
    expect(body.get('client_reference_id')).toBe('user_1')
    expect(body.get('subscription_data[metadata][userId]')).toBe('user_1')
    expect(body.has('payment_method_types[0]')).toBe(false)
    expect(session.url).toBe('https://checkout.stripe.com/c/pay/cs_x')
  })

  it('surfaces a Stripe rejection as an error for the route to log', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":{"message":"nope"}}', { status: 400 })) as unknown as typeof fetch
    await expect(createCheckoutSession('user_1', 'a@b.com')).rejects.toThrow('Stripe checkout failed (400)')
  })
})