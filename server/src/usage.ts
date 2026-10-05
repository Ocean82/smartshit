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
import { FREE_DAILY_LIMIT as SHARED_FREE_DAILY_LIMIT } from '../../shared/config.js'

const FREE_DAILY_LIMIT = Number(process.env.FREE_DAILY_LIMIT ?? SHARED_FREE_DAILY_LIMIT)

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
  /** null = unlimited (Pro / BYOK). Prefer over Infinity — JSON.stringify turns Infinity into null anyway. */
  remaining: number | null
  limit: number | null
  used: number
  isPro: boolean
}

function unlimited(): UsageCheckResult {
  return { allowed: true, remaining: null, limit: null, used: 0, isPro: true }
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
 * Reserve a free-tier slot BEFORE inference (F16c).
 *
 * check-then-record left a gap where two concurrent requests could both pass a
 * read-only pre-check and both bill. This reserves a slot with a SINGLE
 * conditional atomic statement that only succeeds under the limit and returns
 * the row; a denied request (limit reached) returns no row and consumes nothing.
 *
 * Pro users are never metered (returns unlimited without touching the counter).
 * On a non-billable or failed turn the caller must undo the reservation with
 * releaseUsage so there is exactly one net increment per billable turn.
 */
export async function reserveUsage(
  userId: string | undefined,
  isPro: boolean,
): Promise<UsageCheckResult> {
  if (isPro) return unlimited()

  const key = userId || '__anonymous__'

  if (!usageEnabled()) {
    return reserveMemory(key)
  }

  try {
    const result = await query<{ request_count: number }>(
      `INSERT INTO smartsht.ai_usage_daily (user_id, usage_date, request_count, updated_at)
       VALUES ($1, CURRENT_DATE, 1, NOW())
       ON CONFLICT (user_id, usage_date)
       DO UPDATE SET request_count = smartsht.ai_usage_daily.request_count + 1,
                     updated_at = NOW()
         WHERE smartsht.ai_usage_daily.request_count < $2
       RETURNING request_count`,
      [key, FREE_DAILY_LIMIT],
    )
    const row = result.rows[0]
    // No row → the conflict/UPDATE branch was blocked by the limit guard → deny.
    if (!row) return denied()
    // A row means the slot was reserved — this request is permitted even when it
    // consumed the final slot (used === limit). allowed must reflect "proceed",
    // not resultFor's "can ask again" (which flips false at the cap).
    return reserved(row.request_count)
  } catch (err) {
    // Fail closed: on a DB error reserve against the in-memory counter so an
    // outage cannot grant unlimited free requests.
    console.error('[usage] DB reserve failed, falling back to memory limiter:', err instanceof Error ? err.message : err)
    return reserveMemory(key)
  }
}

/** In-memory reserve used when no DB is configured or a query throws. */
function reserveMemory(key: string): UsageCheckResult {
  const today = getToday()
  const entry = memoryUsage.get(key)
  const used = !entry || entry.date !== today ? 0 : entry.count
  if (used >= FREE_DAILY_LIMIT) return denied()
  const next = used + 1
  memoryUsage.set(key, { count: next, date: today })
  return reserved(next)
}

/** A denied reservation — at/over the daily limit, nothing consumed. */
function denied(): UsageCheckResult {
  return { allowed: false, remaining: 0, limit: FREE_DAILY_LIMIT, used: FREE_DAILY_LIMIT, isPro: false }
}

/**
 * A successful reservation. `allowed` is true (proceed with inference) even when
 * this request took the final slot (`used === FREE_DAILY_LIMIT`); the next
 * request will be denied because the counter is now at the cap.
 */
function reserved(used: number): UsageCheckResult {
  return {
    allowed: true,
    remaining: Math.max(0, FREE_DAILY_LIMIT - used),
    limit: FREE_DAILY_LIMIT,
    used,
    isPro: false,
  }
}

/**
 * Release a previously reserved slot (F16c) when the turn did NOT bill app-funded
 * inference (local/deterministic/BYOK-only/failed). Decrements by one, floored at
 * zero. No-op semantics on error, like recordUsage.
 */
export async function releaseUsage(userId: string | undefined): Promise<void> {
  const key = userId || '__anonymous__'

  if (!usageEnabled()) {
    releaseMemory(key)
    return
  }

  try {
    await query(
      `UPDATE smartsht.ai_usage_daily
       SET request_count = GREATEST(request_count - 1, 0), updated_at = NOW()
       WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
      [key],
    )
  } catch (err) {
    console.error('[usage] release failed, decrementing memory limiter:', err instanceof Error ? err.message : err)
    releaseMemory(key)
  }
}

/** In-memory release counterpart, floored at zero. */
function releaseMemory(key: string): void {
  const today = getToday()
  const entry = memoryUsage.get(key)
  if (!entry || entry.date !== today) return
  entry.count = Math.max(0, entry.count - 1)
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
    // Fail closed on the write path too: bump the in-memory counter so a DB
    // outage cannot erase metering. Multi-instance deployments may still
    // under-count across workers until DB recovers — prefer shared Postgres.
    console.error('[usage] record failed, bumping memory limiter:', err instanceof Error ? err.message : err)
    const today = getToday()
    const entry = memoryUsage.get(key)
    if (!entry || entry.date !== today) {
      memoryUsage.set(key, { count: 1, date: today })
    } else {
      entry.count += 1
    }
  }
}

/** Usage stats for the /api/usage endpoint. */
export async function getUsageStats(
  userId: string | undefined,
  isPro: boolean,
  revocationReason: string | null,
): Promise<UsageCheckResult & { revocationReason: string | null }> {
  const base = await checkUsage(userId, isPro)
  return { ...base, revocationReason }
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
