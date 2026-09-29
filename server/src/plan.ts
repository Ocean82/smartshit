/**
 * Pro-plan resolution with a short-lived cache.
 *
 * Extracted from index.ts so that every LLM-backed route (chat *and* the
 * formula-level AI functions) enforces entitlements through the same code path.
 * Without a single shared helper it is easy to add a new billable endpoint that
 * forgets the check entirely.
 */

import { config } from './config.js'
import { getClerkClient, planFromPublicMetadata } from './auth/clerk.js'

const PRO_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export type SubscriptionStatus = {
  isPro: boolean
  /** Persisted by writeClerkPlan on demotion; never 'unknown' (that never persists). */
  revocationReason: string | null
}

const statusCache = new Map<string, { status: SubscriptionStatus; expiresAt: number }>()

function emptyStatus(): SubscriptionStatus {
  return { isPro: false, revocationReason: null }
}

/**
 * Normalize a stored reason at the API boundary. `unknown` means Stripe could
 * not be reached at write time; writeClerkPlan refuses to persist it, but a
 * stale/wrong value must never surface as a revocation either.
 */
function storedRevocationReason(metadata: Record<string, unknown>): string | null {
  const reason = metadata.revocationReason
  if (typeof reason !== 'string' || reason === '' || reason === 'unknown') return null
  return reason
}

/**
 * Resolve a user's plan state (pro flag plus the stored revocation reason) from
 * Clerk publicMetadata, hitting the API at most once per TTL window per user.
 */
export async function resolveSubscriptionStatus(userId: string | null | undefined): Promise<SubscriptionStatus> {
  if (!userId || !config.clerkSecretKey) return emptyStatus()

  const cached = statusCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.status
  }

  try {
    const user = await getClerkClient().users.getUser(userId)
    const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>
    const status: SubscriptionStatus = {
      isPro: planFromPublicMetadata(metadata) === 'pro',
      revocationReason: storedRevocationReason(metadata),
    }
    statusCache.set(userId, { status, expiresAt: Date.now() + PRO_CACHE_TTL_MS })
    return status
  } catch {
    // On error, fall back to the cached value if we have one (even if expired)
    return cached?.status ?? emptyStatus()
  }
}

/**
 * Resolve whether a user is on the Pro plan, hitting Clerk at most once per
 * TTL window per user.
 */
export async function resolveIsPro(userId: string | null | undefined): Promise<boolean> {
  return (await resolveSubscriptionStatus(userId)).isPro
}

/** Drop a user's cached plan so a change takes effect immediately. */
export function invalidateProCache(userId: string): void {
  statusCache.delete(userId)
}

/** Clear the entire cache (test helper). */
export function clearProCache(): void {
  statusCache.clear()
}
