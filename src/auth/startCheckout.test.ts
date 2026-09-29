import { describe, it, expect, vi, afterEach } from 'vitest'
import { startCheckout } from './startCheckout'

/**
 * The unit tier is `environment: 'node'` (no jsdom, no new deps), so the DOM edge
 * is stubbed as plain globals: a fake `window` whose `location.href` is writable.
 * That also pins *how* the module navigates (assigning `location.href`), not just
 * that it returns the right outcome.
 */

const realFetch = globalThis.fetch
const realWindow = (globalThis as { window?: unknown }).window

afterEach(() => {
  globalThis.fetch = realFetch
  ;(globalThis as { window?: unknown }).window = realWindow
  vi.resetModules()
  vi.doUnmock('@/lib/cloudSync')
})

/** Stubs the lazy import's module and returns the fake `window` for assertions. */
function stubClerkAndFetch(options: {
  fetchImpl: unknown
  getAuthHeaders?: () => Promise<Record<string, string>>
}) {
  vi.doMock('@/lib/cloudSync', () => ({
    getAuthHeaders: options.getAuthHeaders ?? (async () => ({ Authorization: 'Bearer test' })),
  }))
  globalThis.fetch = options.fetchImpl as typeof fetch
  const fakeWindow = { location: { href: '' } }
  ;(globalThis as { window?: unknown }).window = fakeWindow
  return fakeWindow
}

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

describe('startCheckout', () => {
  it('POSTs to /api/checkout with auth headers, then sends the browser to Stripe', async () => {
    const fetchMock = vi.fn(() => ok({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' }))
    const getAuthHeaders = vi.fn(async () => ({ Authorization: 'Bearer test' }))
    const fakeWindow = stubClerkAndFetch({ fetchImpl: fetchMock, getAuthHeaders })

    await expect(startCheckout()).resolves.toBe('redirected')

    expect(getAuthHeaders).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url.endsWith('/api/checkout')).toBe(true)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer test' })
    expect(init.body).toBe(JSON.stringify({ email: '' }))
    expect(fakeWindow.location.href).toBe('https://checkout.stripe.com/c/pay/cs_test_123')
  })

  it('reports no-url, without navigating, when checkout responds without a url', async () => {
    const fakeWindow = stubClerkAndFetch({ fetchImpl: vi.fn(() => ok({})) })

    await expect(startCheckout()).resolves.toBe('no-url')

    expect(fakeWindow.location.href).toBe('')
  })

  it('reports failed, without navigating, on a non-ok response', async () => {
    // A JSON error body on purpose: a non-JSON body would make the `res.json()`
    // parse throw and mask a removed `res.ok` guard.
    const fakeWindow = stubClerkAndFetch({
      fetchImpl: vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'no' }), { status: 500 }))),
    })

    await expect(startCheckout()).resolves.toBe('failed')

    expect(fakeWindow.location.href).toBe('')
  })

  it('reports failed rather than rejecting when Clerk or the network throws', async () => {
    vi.doMock('@/lib/cloudSync', () => ({
      getAuthHeaders: async () => {
        throw new Error('no session')
      },
    }))
    const fakeWindow = stubClerkAndFetch({ fetchImpl: vi.fn() })

    await expect(startCheckout()).resolves.toBe('failed')

    expect(fakeWindow.location.href).toBe('')
  })
})
