export type CheckoutInterval = 'monthly' | 'annual'

/**
 * The single start-checkout call.
 *
 * `UpgradePrompt`, `UpgradeGate`, and the revocation banner all POST to
 * `/api/checkout`. Price IDs are chosen server-side from env
 * (`STRIPE_PRICE_ID` / `STRIPE_PRICE_ID_ANNUAL`); the client only sends interval.
 */
export async function startCheckout(
  interval: CheckoutInterval = 'monthly',
): Promise<'redirected' | 'no-url' | 'failed'> {
  try {
    // Imported lazily so a caller that never starts checkout never pays for the
    // auth-header module (and its Clerk dependency) in a non-browser build.
    const { getAuthHeaders } = await import('@/lib/cloudSync')
    const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''
    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: {
        ...(await getAuthHeaders()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: '', interval }),
    })

    if (!res.ok) return 'failed'
    const { url } = (await res.json()) as { url?: string }
    if (!url) return 'no-url'
    window.location.href = url
    return 'redirected'
  } catch {
    return 'failed'
  }
}
