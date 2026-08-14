import { Router, type Request, type Response } from 'express'
import { query } from '../db.js'
import { uploadWorkbook, downloadObject, deleteObject } from '../s3.js'
import { config } from '../config.js'
import { getRequestUserId } from '../auth/clerk.js'
import { resolveIsPro } from '../plan.js'
import { syncWorkbookCells } from '../cellStore.js'
import { sendServerError } from '../httpError.js'

export const workbooksRouter = Router()

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function getUserId(req: Request): string | null {
  return getRequestUserId(req)
}

/**
 * Authenticate request and return userId, or send 401.
 * Returns null (response already sent) when auth fails.
 */
function requireUserId(req: Request, res: Response): string | null {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return null
  }
  return userId
}

/**
 * Look up a workbook by ID and verify ownership.
 * Handles 404 (not found / deleted) and 403 (wrong owner) responses.
 * Returns the row data on success, null if the response was already sent.
 */
async function requireWorkbookOwnership<T extends { owner_id: string }>(
  id: string,
  userId: string,
  res: Response,
  selectColumns: string,
): Promise<T | null> {
  const result = await query<T>(
    `SELECT ${selectColumns} FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
    [id],
  )

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Workbook not found' })
    return null
  }

  const row = result.rows[0]
  if (row.owner_id !== userId) {
    res.status(403).json({ error: 'Access denied' })
    return null
  }

  return row
}

/**
 * Check whether a free-tier user has reached the cloud workbook cap.
 * Returns true if the limit is exceeded (response already sent), false if OK.
 */
async function exceedsFreeTierWorkbookLimit(userId: string, res: Response): Promise<boolean> {
  const isPro = await resolveIsPro(userId)
  if (isPro) return false

  const countResult = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM smartsht.workbooks
     WHERE owner_id = $1 AND NOT is_deleted`,
    [userId],
  )
  const existing = Number(countResult.rows[0]?.count ?? 0)

  if (existing >= config.freeCloudWorkbookLimit) {
    res.status(403).json({
      error:
        `Free accounts are limited to ${config.freeCloudWorkbookLimit} cloud workbook. ` +
        'Upgrade to Pro for unlimited cloud storage.',
      code: 'FREE_CLOUD_WORKBOOK_LIMIT',
      limit: config.freeCloudWorkbookLimit,
    })
    return true
  }

  return false
}

/**
 * Fire-and-forget cell sync after workbook save.
 * Never throws or blocks the caller.
 */
function syncCellsAsync(workbookId: string, rawData: string, label: string): void {
  try {
    const workbookData = JSON.parse(rawData) as {
      sheets?: Array<{
        name: string
        cells: Record<string, { value?: string | number | boolean | null; formula?: string }>
      }>
    }
    if (workbookData.sheets?.length) {
      void syncWorkbookCells(workbookId, workbookData.sheets).catch((err) =>
        console.warn(`[cellStore] sync failed on ${label}:`, err instanceof Error ? err.message : err),
      )
    }
  } catch { /* non-critical parse failure */ }
}

/**
 * Build dynamic UPDATE SET clause for workbook metadata.
 * Returns the SQL fragment and combined parameter array.
 */
function buildWorkbookUpdateQuery(
  s3Key: string,
  sizeBytes: number,
  id: string,
  options: { name?: string; sheetCount?: number },
): { sql: string; params: unknown[] } {
  const fields: string[] = ['s3_key = $1', 'size_bytes = $2', 'last_saved_at = NOW()']
  const params: unknown[] = [s3Key, sizeBytes]
  let idx = 3

  if (options.name) {
    fields.push(`name = $${idx}`)
    params.push(options.name)
    idx++
  }

  if (options.sheetCount !== undefined) {
    fields.push(`sheet_count = $${idx}`)
    params.push(options.sheetCount)
    idx++
  }

  params.push(id)
  return {
    sql: `UPDATE smartsht.workbooks SET ${fields.join(', ')} WHERE id = $${idx}`,
    params,
  }
}

// ─── GET /api/workbooks — List user's workbooks ──────────────────────────────

workbooksRouter.get('/', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return

  try {
    const result = await query(
      `SELECT id, name, size_bytes, sheet_count, last_saved_at, created_at
       FROM smartsht.workbooks
       WHERE owner_id = $1 AND NOT is_deleted
       ORDER BY last_saved_at DESC`,
      [userId],
    )

    res.json({ workbooks: result.rows })
  } catch (err) {
    sendServerError(res, 'workbooks', err)
  }
})

// ─── POST /api/workbooks — Create/save a new workbook ────────────────────────

workbooksRouter.post('/', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { name, data, sheetCount } = req.body as {
    name: string
    data: string
    sheetCount?: number
  }

  if (!name || !data) {
    res.status(400).json({ error: 'name and data are required' })
    return
  }

  try {
    // Free-tier cloud workbook cap
    if (await exceedsFreeTierWorkbookLimit(userId, res)) return

    // Ensure user exists (upsert on first save)
    await query(
      `INSERT INTO smartsht.users (id, last_seen_at)
       VALUES ($1, NOW())
       ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()`,
      [userId],
    )

    // Create workbook record
    const insertResult = await query<{ id: string }>(
      `INSERT INTO smartsht.workbooks (owner_id, name, s3_key, size_bytes, sheet_count)
       VALUES ($1, $2, '', 0, $3)
       RETURNING id`,
      [userId, name, sheetCount ?? 1],
    )

    const workbookId = insertResult.rows[0].id

    // Upload to S3
    const { key, sizeBytes } = await uploadWorkbook(userId, workbookId, 'latest.json', data)

    // Update the record with the S3 key and size
    await query(
      `UPDATE smartsht.workbooks SET s3_key = $1, size_bytes = $2 WHERE id = $3`,
      [key, sizeBytes, workbookId],
    )

    // Create initial version (v001)
    const versionKey = `${config.s3Prefix}/workbooks/${userId}/${workbookId}/v001.json`
    await uploadWorkbook(userId, workbookId, 'v001.json', data)

    await query(
      `INSERT INTO smartsht.workbook_versions (workbook_id, version_number, s3_key, size_bytes, description)
       VALUES ($1, 1, $2, $3, $4)`,
      [workbookId, versionKey, sizeBytes, 'Initial save'],
    )

    res.status(201).json({
      id: workbookId,
      s3Key: key,
      sizeBytes,
      version: 1,
    })

    syncCellsAsync(workbookId, data, 'create')
  } catch (err) {
    sendServerError(res, 'workbooks', err)
  }
})

// ─── GET /api/workbooks/:id — Download a workbook ────────────────────────────

workbooksRouter.get('/:id', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.params

  try {
    const workbook = await requireWorkbookOwnership<{ owner_id: string; s3_key: string }>(
      id, userId, res, 'owner_id, s3_key',
    )
    if (!workbook) return

    const data = await downloadObject(workbook.s3_key)
    res.setHeader('Content-Type', 'application/json')
    res.send(data)
  } catch (err) {
    sendServerError(res, 'workbooks', err)
  }
})

// ─── PUT /api/workbooks/:id — Update (save) a workbook ──────────────────────

workbooksRouter.put('/:id', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.params
  const { name, data, sheetCount } = req.body as {
    name?: string
    data: string
    sheetCount?: number
  }

  if (!data) {
    res.status(400).json({ error: 'data is required' })
    return
  }

  try {
    // Verify ownership
    const existing = await requireWorkbookOwnership<{ owner_id: string; s3_key: string }>(
      id, userId, res, 'owner_id, s3_key',
    )
    if (!existing) return

    // Upload new version to S3 (latest)
    const { key, sizeBytes } = await uploadWorkbook(userId, id, 'latest.json', data)

    // Get next version number
    const versionResult = await query<{ max_version: number | null }>(
      `SELECT MAX(version_number) as max_version FROM smartsht.workbook_versions WHERE workbook_id = $1`,
      [id],
    )
    const nextVersion = (versionResult.rows[0].max_version ?? 0) + 1

    // Upload versioned copy
    const versionFilename = `v${String(nextVersion).padStart(3, '0')}.json`
    const versionUpload = await uploadWorkbook(userId, id, versionFilename, data)

    // Insert version record
    await query(
      `INSERT INTO smartsht.workbook_versions (workbook_id, version_number, s3_key, size_bytes, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, nextVersion, versionUpload.key, sizeBytes, 'Auto-save'],
    )

    // Prune old versions beyond retention window (fire-and-forget)
    void pruneOldVersions(id)

    // Update workbook metadata
    const update = buildWorkbookUpdateQuery(key, sizeBytes, id, { name, sheetCount })
    await query(update.sql, update.params)

    // Update user last_seen
    await query(`UPDATE smartsht.users SET last_seen_at = NOW() WHERE id = $1`, [userId])

    res.json({
      saved: true,
      version: nextVersion,
      sizeBytes,
    })

    syncCellsAsync(id, data, 'save')
  } catch (err) {
    sendServerError(res, 'workbooks', err)
  }
})

// ─── DELETE /api/workbooks/:id — Soft-delete a workbook ──────────────────────

workbooksRouter.delete('/:id', async (req, res) => {
  const userId = requireUserId(req, res)
  if (!userId) return

  const { id } = req.params

  try {
    const workbook = await requireWorkbookOwnership<{ owner_id: string }>(
      id, userId, res, 'owner_id',
    )
    if (!workbook) return

    await query(`UPDATE smartsht.workbooks SET is_deleted = TRUE WHERE id = $1`, [id])
    res.json({ deleted: true })
  } catch (err) {
    sendServerError(res, 'workbooks', err)
  }
})

// ─── Version retention ───────────────────────────────────────────────────────

/** How many historical versions to keep per workbook. */
const MAX_VERSIONS_PER_WORKBOOK = Number(process.env.MAX_WORKBOOK_VERSIONS ?? 50)

/**
 * Drop the oldest versions beyond the retention window, removing both the DB
 * row and the backing S3 object.
 *
 * Best-effort and fire-and-forget: a pruning failure must never fail the user's
 * save. Errors are logged instead.
 */
async function pruneOldVersions(workbookId: string): Promise<void> {
  try {
    const stale = await query<{ id: string; s3_key: string }>(
      `SELECT id, s3_key FROM smartsht.workbook_versions
       WHERE workbook_id = $1
       ORDER BY version_number DESC
       OFFSET $2`,
      [workbookId, MAX_VERSIONS_PER_WORKBOOK],
    )

    if (stale.rows.length === 0) return

    await query(
      `DELETE FROM smartsht.workbook_versions WHERE id = ANY($1::uuid[])`,
      [stale.rows.map((row) => row.id)],
    )

    await Promise.all(
      stale.rows.map((row) =>
        deleteObject(row.s3_key).catch((err) =>
          console.warn(
            `[workbooks] Could not delete version object ${row.s3_key}:`,
            err instanceof Error ? err.message : err,
          ),
        ),
      ),
    )
  } catch (err) {
    console.warn(
      '[workbooks] Version pruning failed:',
      err instanceof Error ? err.message : err,
    )
  }
}
