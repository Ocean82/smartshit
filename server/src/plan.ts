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

const proCache = new Map<string, { isPro: boolean; expiresAt: number }>()

/**
 * Resolve whether a user is on the Pro plan, hitting Clerk at most once per
 * TTL window per user.
 */
export async function resolveIsPro(userId: string | null | undefined): Promise<boolean> {
  if (!userId || !config.clerkSecretKey) return false

  const cached = proCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.isPro
  }

  try {
    const user = await getClerkClient().users.getUser(userId)
    const isPro = planFromPublicMetadata(user.publicMetadata as Record<string, unknown>) === 'pro'
    proCache.set(userId, { isPro, expiresAt: Date.now() + PRO_CACHE_TTL_MS })
    return isPro
  } catch {
    // On error, fall back to the cached value if we have one (even if expired)
    return cached?.isPro ?? false
  }
}

/** Drop a user's cached plan so a change takes effect immediately. */
export function invalidateProCache(userId: string): void {
  proCache.delete(userId)
}

/** Clear the entire cache (test helper). */
export function clearProCache(): void {
  proCache.clear()
}
