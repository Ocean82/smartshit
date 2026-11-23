import { getAuthStatus } from '@/lib/serverAccess'

/**
 * Send a paying user to Stripe's hosted billing portal (update card, invoices, cancel).
 *
 * The server derives the Stripe customer from the signed-in account, so the client
 * sends no identifiers. Callers must only offer this to signed-in Pro users.
 */
export async function openBillingPortal(): Promise<'redirected' | 'no-subscription' | 'failed'> {
  if (getAuthStatus() !== 'signed-in') return 'failed'
  try {
    // Lazy for the same reason as startCheckout: keeps Clerk out of non-browser builds.
    const { getAuthHeaders } = await import('@/lib/cloudSync')
    const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''
    const res = await fetch(`${API_BASE}/api/billing-portal`, {
      method: 'POST',
      headers: { ...(await getAuthHeaders()), 'Content-Type': 'application/json' },
    })
    if (res.status === 404) return 'no-subscription'
    if (!res.ok) return 'failed'
    const { url } = (await res.json()) as { url?: string }
    if (!url) return 'failed'
    window.location.href = url
    return 'redirected'
  } catch {
    return 'failed'
  }
}
