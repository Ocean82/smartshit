/**
 * Soft-deleted workbook hard purge (GDPR / storage cost).
 *
 * Soft delete immediately revokes shares. After GRACE_DAYS, this job deletes
 * S3 objects (latest + versions) then removes the workbook row (CASCADE cleans
 * versions, cells, sheet_meta, cell_sync, remaining shares).
 */

import { query } from './db.js'
import { deleteObject } from './s3.js'

/** Days to keep soft-deleted workbooks before hard purge. */
export const WORKBOOK_DELETE_GRACE_DAYS = 30

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours
const BATCH_LIMIT = 50

export interface PurgeResult {
  scanned: number
  purged: number
  errors: number
}

/**
 * Hard-purge workbooks soft-deleted longer than the grace period.
 * Safe to call repeatedly; never throws to the caller.
 */
export async function purgeExpiredDeletedWorkbooks(
  graceDays = WORKBOOK_DELETE_GRACE_DAYS,
): Promise<PurgeResult> {
  const result: PurgeResult = { scanned: 0, purged: 0, errors: 0 }

  try {
    const due = await query<{ id: string; s3_key: string }>(
      `SELECT id, s3_key FROM smartsht.workbooks
       WHERE is_deleted
         AND deleted_at IS NOT NULL
         AND deleted_at < NOW() - ($1::text || ' days')::interval
       ORDER BY deleted_at ASC
       LIMIT $2`,
      [String(graceDays), BATCH_LIMIT],
    )
    result.scanned = due.rows.length

    for (const wb of due.rows) {
      try {
        await hardPurgeWorkbook(wb.id, wb.s3_key)
        result.purged++
      } catch (err) {
        result.errors++
        console.warn(
          `[purge] Failed to purge workbook ${wb.id}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  } catch (err) {
    console.warn(
      '[purge] Query for expired soft-deletes failed:',
      err instanceof Error ? err.message : err,
    )
  }

  return result
}

async function hardPurgeWorkbook(workbookId: string, latestKey: string): Promise<void> {
  const versions = await query<{ s3_key: string }>(
    `SELECT s3_key FROM smartsht.workbook_versions WHERE workbook_id = $1`,
    [workbookId],
  )

  const keys = new Set<string>()
  if (latestKey) keys.add(latestKey)
  for (const row of versions.rows) {
    if (row.s3_key) keys.add(row.s3_key)
  }

  await Promise.all(
    [...keys].map((key) =>
      deleteObject(key).catch((err) =>
        console.warn(
          `[purge] S3 delete failed for ${key}:`,
          err instanceof Error ? err.message : err,
        ),
      ),
    ),
  )

  // CASCADE removes versions, cells, sheet_meta, cell_sync, shares
  await query(`DELETE FROM smartsht.workbooks WHERE id = $1 AND is_deleted`, [workbookId])
}

let purgeTimer: ReturnType<typeof setInterval> | null = null

/** Start the periodic purge loop (idempotent). */
export function startWorkbookPurgeScheduler(): void {
  if (purgeTimer) return
  // Kick once shortly after boot, then on interval
  void purgeExpiredDeletedWorkbooks()
  purgeTimer = setInterval(() => {
    void purgeExpiredDeletedWorkbooks()
  }, PURGE_INTERVAL_MS)
  // Allow Node to exit in tests if this is the only timer
  if (typeof purgeTimer.unref === 'function') purgeTimer.unref()
}

/** Stop the scheduler (tests / shutdown). */
export function stopWorkbookPurgeScheduler(): void {
  if (!purgeTimer) return
  clearInterval(purgeTimer)
  purgeTimer = null
}
