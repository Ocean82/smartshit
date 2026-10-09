/**
 * Server-side metering for the free tier's lifetime auditor auto-fixes.
 *
 * Fixes are applied in the browser, so this cannot stop a modified client. It
 * does make the limit survive cleared storage, other browsers, and a saved BYOK
 * key (BYOK covers AI questions, not auto-fix).
 *
 * Persisted in `smartsht.autofix_usage`; falls back to an in-memory counter when
 * no database is configured or a query fails, so an outage never grants unlimited fixes.
 */

import { config } from './config.js'
import { query } from './db.js'
import { FREE_AUTOFIX_LIFETIME_LIMIT } from '../../shared/config.js'

export interface AutoFixReservation {
  allowed: boolean
  /** null = unlimited (Pro). */
  used: number | null
  limit: number | null
}

const memoryUsage = new Map<string, number>()

function denied(): AutoFixReservation {
  return { allowed: false, used: FREE_AUTOFIX_LIFETIME_LIMIT, limit: FREE_AUTOFIX_LIFETIME_LIMIT }
}

function reserveMemory(userId: string): AutoFixReservation {
  const used = memoryUsage.get(userId) ?? 0
  if (used >= FREE_AUTOFIX_LIFETIME_LIMIT) return denied()
  memoryUsage.set(userId, used + 1)
  return { allowed: true, used: used + 1, limit: FREE_AUTOFIX_LIFETIME_LIMIT }
}

/** Atomically take one lifetime auto-fix slot; Pro is unlimited and unmetered. */
export async function reserveAutoFix(userId: string, isPro: boolean): Promise<AutoFixReservation> {
  if (isPro) return { allowed: true, used: null, limit: null }
  if (!config.databaseUrl) return reserveMemory(userId)

  try {
    const result = await query<{ used_count: number }>(
      `INSERT INTO smartsht.autofix_usage (user_id, used_count, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET used_count = smartsht.autofix_usage.used_count + 1,
                     updated_at = NOW()
         WHERE smartsht.autofix_usage.used_count < $2
       RETURNING used_count`,
      [userId, FREE_AUTOFIX_LIFETIME_LIMIT],
    )
    const row = result.rows[0]
    if (!row) return denied()
    return { allowed: true, used: row.used_count, limit: FREE_AUTOFIX_LIFETIME_LIMIT }
  } catch (err) {
    console.error('[autofix] DB reserve failed, using memory limiter:', err instanceof Error ? err.message : err)
    return reserveMemory(userId)
  }
}
