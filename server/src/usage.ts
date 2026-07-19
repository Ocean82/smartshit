/**
 * Server-side usage tracking — prevents free tier bypass.
 * Uses in-memory store with daily reset. Survives browser clear/incognito.
 * 
 * For scale: replace with Redis or a simple SQLite file.
 */

const FREE_DAILY_LIMIT = 3

// In-memory store: userId -> { count, date }
const usageMap = new Map<string, { count: number; date: string }>()

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface UsageCheckResult {
  allowed: boolean
  remaining: number
  limit: number
  used: number
  isPro: boolean
}

/**
 * Check if a user can make an AI request.
 * Returns allowed=true if they're under the limit or have Pro status.
 */
export function checkUsage(userId: string | undefined, isPro: boolean): UsageCheckResult {
  // Pro users always allowed
  if (isPro) {
    return { allowed: true, remaining: Infinity, limit: Infinity, used: 0, isPro: true }
  }

  // Anonymous users (no userId) get a generous limit but can't bypass
  const key = userId || '__anonymous__'
  const today = getToday()
  const entry = usageMap.get(key)

  if (!entry || entry.date !== today) {
    // New day or new user
    return { allowed: true, remaining: FREE_DAILY_LIMIT, limit: FREE_DAILY_LIMIT, used: 0, isPro: false }
  }

  const remaining = Math.max(0, FREE_DAILY_LIMIT - entry.count)
  return {
    allowed: entry.count < FREE_DAILY_LIMIT,
    remaining,
    limit: FREE_DAILY_LIMIT,
    used: entry.count,
    isPro: false,
  }
}

/**
 * Record a usage event for a user.
 * Call this AFTER a successful AI response is generated.
 */
export function recordUsage(userId: string | undefined): void {
  const key = userId || '__anonymous__'
  const today = getToday()
  const entry = usageMap.get(key)

  if (!entry || entry.date !== today) {
    usageMap.set(key, { count: 1, date: today })
  } else {
    entry.count += 1
  }
}

/**
 * Get usage stats for a user (for the /api/usage endpoint).
 */
export function getUsageStats(userId: string | undefined, isPro: boolean): UsageCheckResult {
  return checkUsage(userId, isPro)
}

/**
 * Clean up old entries (call periodically to prevent memory leaks).
 * Removes entries from previous days.
 */
export function cleanupOldUsage(): void {
  const today = getToday()
  for (const [key, entry] of usageMap.entries()) {
    if (entry.date !== today) {
      usageMap.delete(key)
    }
  }
}

// Clean up every hour
setInterval(cleanupOldUsage, 60 * 60 * 1000)
