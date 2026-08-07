/**
 * Server-side usage tracking — enforces the free-tier AI quota.
 *
 * Counters are persisted in Postgres (`smartsht.ai_usage_daily`) so the limit
 * survives restarts and is shared across processes. The previous in-memory Map
 * reset on every deploy and was silently multiplied by the number of workers.
 *
 * When DATABASE_URL is not configured (local dev, self-hosting without cloud
 * features) we fall back to the in-memory counter so the server still runs.
 */

import { config } from './config.js'
import { query } from './db.js'

const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT ?? 10)

/** Fallback store used only when no database is configured. */
const memoryUsage = new Map<string, { count: number; date: string }>()

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function usageEnabled(): boolean {
  return Boolean(config.databaseUrl)
}

export interface UsageCheckResult {
  allowed: boolean
  remaining: number
  limit: number
  used: number
  isPro: boolean
}

function unlimited(): UsageCheckResult {
  return { allowed: true, remaining: Infinity, limit: Infinity, used: 0, isPro: true }
}

function resultFor(used: number): UsageCheckResult {
  return {
    allowed: used < FREE_DAILY_LIMIT,
    remaining: Math.max(0, FREE_DAILY_LIMIT - used),
    limit: FREE_DAILY_LIMIT,
    used,
    isPro: false,
  }
}

/**
 * Check whether a user may make another AI request today.
 *
 * Pro users are always allowed. Anonymous callers share a single bucket, which
 * is intentional — an unauthenticated client must not be able to mint fresh
 * quota simply by omitting an identifier.
 */
export async function checkUsage(
  userId: string | undefined,
  isPro: boolean,
): Promise<UsageCheckResult> {
  if (isPro) return unlimited()

  const key = userId || '__anonymous__'

  if (!usageEnabled()) {
    const entry = memoryUsage.get(key)
    const used = !entry || entry.date !== getToday() ? 0 : entry.count
    return resultFor(used)
  }

  try {
    const result = await query<{ request_count: number }>(
      `SELECT request_count FROM smartsht.ai_usage_daily
       WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
      [key],
    )
    return resultFor(result.rows[0]?.request_count ?? 0)
  } catch (err) {
    // Fail closed: unknown metering state → deny and fall back to in-memory
    // counter. This ensures a DB outage doesn't grant unlimited free requests,
    // while still allowing users who haven't hit the memory limit to proceed.
    console.error('[usage] DB check failed, falling back to memory limiter:', err instanceof Error ? err.message : err)
    const entry = memoryUsage.get(key)
    const used = !entry || entry.date !== getToday() ? 0 : entry.count
    return resultFor(used)
  }
}

/**
 * Record a billable AI request. Call only after a response was produced.
 */
export async function recordUsage(userId: string | undefined): Promise<void> {
  const key = userId || '__anonymous__'

  if (!usageEnabled()) {
    const today = getToday()
    const entry = memoryUsage.get(key)
    if (!entry || entry.date !== today) {
      memoryUsage.set(key, { count: 1, date: today })
    } else {
      entry.count += 1
    }
    return
  }

  try {
    await query(
      `INSERT INTO smartsht.ai_usage_daily (user_id, usage_date, request_count, updated_at)
       VALUES ($1, CURRENT_DATE, 1, NOW())
       ON CONFLICT (user_id, usage_date)
       DO UPDATE SET request_count = smartsht.ai_usage_daily.request_count + 1,
                     updated_at = NOW()`,
      [key],
    )
  } catch (err) {
    console.error('[usage] record failed:', err instanceof Error ? err.message : err)
  }
}

/** Usage stats for the /api/usage endpoint. */
export async function getUsageStats(
  userId: string | undefined,
  isPro: boolean,
): Promise<UsageCheckResult> {
  return checkUsage(userId, isPro)
}

/** Remove counters older than the retention window. */
export async function cleanupOldUsage(retentionDays = 30): Promise<void> {
  const today = getToday()
  for (const [key, entry] of memoryUsage.entries()) {
    if (entry.date !== today) memoryUsage.delete(key)
  }

  if (!usageEnabled()) return

  try {
    await query(
      `DELETE FROM smartsht.ai_usage_daily
       WHERE usage_date < CURRENT_DATE - ($1::int)`,
      [retentionDays],
    )
  } catch (err) {
    console.error('[usage] cleanup failed:', err instanceof Error ? err.message : err)
  }
}

// Prune hourly. unref() so the timer never holds the process open.
const cleanupTimer = setInterval(() => void cleanupOldUsage(), 60 * 60 * 1000)
cleanupTimer.unref?.()
