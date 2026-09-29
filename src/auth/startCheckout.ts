/**
 * The single start-checkout call.
 *
 * `UpgradePrompt`, `UpgradeGate`, and the revocation banner all had (or wanted) the
 * same POST to `/api/checkout`; the banner's link to `/app#upgrade` went nowhere
 * because the app has no `#upgrade` hash handler. This is the working behaviour
 * they now share, so the redirect out to Stripe is identical for every caller.
 */
export async function startCheckout(): Promise<'redirected' | 'no-url' | 'failed'> {
  try {
    // Imported lazily so a caller that never starts checkout never pays for the
    // auth-header module (and its Clerk dependency) in a non-browser build.
    const { getAuthHeaders } = await import('@/lib/cloudSync')
    const API_BASE = import.meta.env.VITE_AI_API_URL ?? ''
    const res = await fetch(`${API_BASE}/api/checkout`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ email: '' }),
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
