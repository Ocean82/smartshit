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
/** If Clerk is unreachable, a stale Pro status is honored only this long past expiry. */
const STALE_PRO_GRACE_MS = 60 * 1000

export type SubscriptionStatus = {
  isPro: boolean
  /** Persisted by writeClerkPlan on demotion; never 'unknown' (that never persists). */
  revocationReason: string | null
}

const statusCache = new Map<string, { status: SubscriptionStatus; expiresAt: number }>()

/** Bumped on invalidation so lookups started earlier cannot repopulate the cache. */
const cacheGeneration = new Map<string, number>()

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

  const generation = cacheGeneration.get(userId) ?? 0
  try {
    const user = await getClerkClient().users.getUser(userId)
    const metadata = (user.publicMetadata ?? {}) as Record<string, unknown>
    const status: SubscriptionStatus = {
      isPro: planFromPublicMetadata(metadata) === 'pro',
      revocationReason: storedRevocationReason(metadata),
    }
    if ((cacheGeneration.get(userId) ?? 0) === generation) {
      statusCache.set(userId, { status, expiresAt: Date.now() + PRO_CACHE_TTL_MS })
    }
    return status
  } catch (err) {
    // On error, fall back to the cached value if we have one. A stale Pro value is only
    // trusted within a short grace window so a revoked user cannot keep access in an outage.
    // Log so a Clerk outage is visible — silent free fallback looks like demotion.
    const message = err instanceof Error ? err.message : 'unknown'
    console.error(
      `[clerk] getUser failed for plan lookup (using ${cached ? 'stale cache' : 'free fallback'}): ${message}`,
    )
    if (cached && (!cached.status.isPro || Date.now() < cached.expiresAt + STALE_PRO_GRACE_MS)) {
      return cached.status
    }
    return emptyStatus()
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
  cacheGeneration.set(userId, (cacheGeneration.get(userId) ?? 0) + 1)
  statusCache.delete(userId)
}

/** Clear the entire cache (test helper). */
export function clearProCache(): void {
  statusCache.clear()
  cacheGeneration.clear()
}
