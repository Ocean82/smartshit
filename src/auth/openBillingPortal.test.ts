import { describe, it, expect, vi, afterEach } from 'vitest'

const realFetch = globalThis.fetch
const realWindow = (globalThis as { window?: unknown }).window
afterEach(() => {
  globalThis.fetch = realFetch
  ;(globalThis as { window?: unknown }).window = realWindow
  vi.resetModules()
  vi.doUnmock('@/lib/cloudSync')
  vi.doUnmock('@/lib/serverAccess')
})

function setup(response: Response | Error, authStatus = 'signed-in') {
  vi.doMock('@/lib/serverAccess', () => ({ getAuthStatus: () => authStatus }))
  vi.doMock('@/lib/cloudSync', () => ({ getAuthHeaders: async () => ({ Authorization: 'Bearer t' }) }))
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  const fakeWindow = { location: { href: '' } }
  ;(globalThis as { window?: unknown }).window = fakeWindow
  return { fetchMock, fakeWindow }
}

// Imported after the mocks are registered so the module sees the stubbed auth status.
const openBillingPortal = async () => (await import('./openBillingPortal')).openBillingPortal()

describe('openBillingPortal', () => {
  it('POSTs with auth headers and sends the browser to the portal URL', async () => {
    const { fetchMock, fakeWindow } = setup(
      new Response(JSON.stringify({ url: 'https://billing.stripe.com/p/session/x' }), { status: 200 }),
    )
    await expect(openBillingPortal()).resolves.toBe('redirected')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url.endsWith('/api/billing-portal')).toBe(true)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer t' })
    expect(fakeWindow.location.href).toBe('https://billing.stripe.com/p/session/x')
  })

  it('reports no-subscription on a 404 and does not navigate', async () => {
    const { fakeWindow } = setup(new Response('{}', { status: 404 }))
    await expect(openBillingPortal()).resolves.toBe('no-subscription')
    expect(fakeWindow.location.href).toBe('')
  })

  it('makes no request when signed out', async () => {
    const { fetchMock } = setup(new Response('{}', { status: 200 }), 'signed-out')
    await expect(openBillingPortal()).resolves.toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports failed on a server error, a missing url, or a network error', async () => {
    setup(new Response('{}', { status: 500 }))
    await expect(openBillingPortal()).resolves.toBe('failed')
    setup(new Response('{}', { status: 200 }))
    await expect(openBillingPortal()).resolves.toBe('failed')
    setup(new Error('offline'))
    await expect(openBillingPortal()).resolves.toBe('failed')
  })
})
