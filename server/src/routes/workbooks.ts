import { Router, type Request, type Response } from 'express'
import { query } from '../db.js'
import { uploadWorkbook, downloadObject, deleteObject } from '../s3.js'
import { config } from '../config.js'
import { getRequestUserId } from '../auth/clerk.js'
import { resolveIsPro } from '../plan.js'
import { syncWorkbookCells } from '../cellStore.js'
import { sendServerError } from '../httpError.js'

export const workbooksRouter = Router()

interface CreateWorkbookPayload {
  name: string
  data: string
  sheetCount: number
}

interface SaveWorkbookPayload {
  name?: string
  data: string
  sheetCount?: number
}

interface CreatedWorkbook {
  id: string
  s3Key: string
  sizeBytes: number
  version: number
}

interface SavedWorkbook {
  saved: true
  version: number
  sizeBytes: number
}

type AuthenticatedHandler = (req: Request, res: Response, userId: string) => Promise<void>

/** How many historical versions to keep per workbook. */
const MAX_VERSIONS_PER_WORKBOOK = Number(process.env.MAX_WORKBOOK_VERSIONS ?? 50)

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

/** Express types `params` as `string | string[]`; `/:id` is always a single segment. */
function workbookIdParam(req: Request): string {
  const id = req.params.id
  return Array.isArray(id) ? id[0] ?? '' : id ?? ''
}

/**
 * Auth + error boundary for workbook routes.
 * Keeps HTTP handlers free of repeated 401 / 500 branching.
 */
function workbookRoute(handler: AuthenticatedHandler) {
  return async (req: Request, res: Response) => {
    const userId = requireUserId(req, res)
    if (!userId) return
    try {
      await handler(req, res, userId)
    } catch (err) {
      sendServerError(res, 'workbooks', err)
    }
  }
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

function isMissingCreateFields(name: unknown, data: unknown): boolean {
  return !name || !data
}

function readCreateWorkbookBody(req: Request, res: Response): CreateWorkbookPayload | null {
  const { name, data, sheetCount } = req.body as {
    name?: unknown
    data?: unknown
    sheetCount?: number
  }

  if (isMissingCreateFields(name, data)) {
    res.status(400).json({ error: 'name and data are required' })
    return null
  }

  return {
    name: name as string,
    data: data as string,
    sheetCount: sheetCount ?? 1,
  }
}

function readSaveWorkbookBody(req: Request, res: Response): SaveWorkbookPayload | null {
  const { name, data, sheetCount } = req.body as {
    name?: string
    data?: string
    sheetCount?: number
  }

  if (!data) {
    res.status(400).json({ error: 'data is required' })
    return null
  }

  return { name, data, sheetCount }
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

function workbookVersionFilename(versionNumber: number): string {
  return `v${String(versionNumber).padStart(3, '0')}.json`
}

async function upsertUserLastSeen(userId: string): Promise<void> {
  await query(
    `INSERT INTO smartsht.users (id, last_seen_at)
     VALUES ($1, NOW())
     ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()`,
    [userId],
  )
}

async function touchUserLastSeen(userId: string): Promise<void> {
  await query(`UPDATE smartsht.users SET last_seen_at = NOW() WHERE id = $1`, [userId])
}

async function insertWorkbookRow(
  userId: string,
  name: string,
  sheetCount: number,
): Promise<string> {
  const insertResult = await query<{ id: string }>(
    `INSERT INTO smartsht.workbooks (owner_id, name, s3_key, size_bytes, sheet_count)
     VALUES ($1, $2, '', 0, $3)
     RETURNING id`,
    [userId, name, sheetCount],
  )
  return insertResult.rows[0].id
}

async function nextWorkbookVersionNumber(workbookId: string): Promise<number> {
  const versionResult = await query<{ max_version: number | null }>(
    `SELECT MAX(version_number) as max_version FROM smartsht.workbook_versions WHERE workbook_id = $1`,
    [workbookId],
  )
  return (versionResult.rows[0].max_version ?? 0) + 1
}

/**
 * Upload a versioned copy and insert the matching workbook_versions row.
 * Shared by create (v001) and save (vNNN).
 */
async function writeWorkbookVersion(
  userId: string,
  workbookId: string,
  data: string,
  versionNumber: number,
  sizeBytes: number,
  description: string,
): Promise<void> {
  const versionUpload = await uploadWorkbook(
    userId,
    workbookId,
    workbookVersionFilename(versionNumber),
    data,
  )

  await query(
    `INSERT INTO smartsht.workbook_versions (workbook_id, version_number, s3_key, size_bytes, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [workbookId, versionNumber, versionUpload.key, sizeBytes, description],
  )
}

async function uploadLatestWorkbook(
  userId: string,
  workbookId: string,
  data: string,
): Promise<{ key: string; sizeBytes: number }> {
  return uploadWorkbook(userId, workbookId, 'latest.json', data)
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

async function persistNewWorkbook(
  userId: string,
  payload: CreateWorkbookPayload,
): Promise<CreatedWorkbook> {
  await upsertUserLastSeen(userId)

  const workbookId = await insertWorkbookRow(userId, payload.name, payload.sheetCount)
  const { key, sizeBytes } = await uploadLatestWorkbook(userId, workbookId, payload.data)

  await query(
    `UPDATE smartsht.workbooks SET s3_key = $1, size_bytes = $2 WHERE id = $3`,
    [key, sizeBytes, workbookId],
  )

  await writeWorkbookVersion(userId, workbookId, payload.data, 1, sizeBytes, 'Initial save')

  return {
    id: workbookId,
    s3Key: key,
    sizeBytes,
    version: 1,
  }
}

async function persistWorkbookUpdate(
  userId: string,
  workbookId: string,
  payload: SaveWorkbookPayload,
): Promise<SavedWorkbook> {
  const { key, sizeBytes } = await uploadLatestWorkbook(userId, workbookId, payload.data)
  const nextVersion = await nextWorkbookVersionNumber(workbookId)

  await writeWorkbookVersion(userId, workbookId, payload.data, nextVersion, sizeBytes, 'Auto-save')
  void pruneOldVersions(workbookId)

  const update = buildWorkbookUpdateQuery(key, sizeBytes, workbookId, {
    name: payload.name,
    sheetCount: payload.sheetCount,
  })
  await query(update.sql, update.params)
  await touchUserLastSeen(userId)

  return {
    saved: true,
    version: nextVersion,
    sizeBytes,
  }
}

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

async function listOwnedWorkbooks(userId: string) {
  return query(
    `SELECT id, name, size_bytes, sheet_count, last_saved_at, created_at
     FROM smartsht.workbooks
     WHERE owner_id = $1 AND NOT is_deleted
     ORDER BY last_saved_at DESC`,
    [userId],
  )
}

async function downloadOwnedWorkbook(
  id: string,
  userId: string,
  res: Response,
): Promise<string | null> {
  const workbook = await requireWorkbookOwnership<{ owner_id: string; s3_key: string }>(
    id, userId, res, 'owner_id, s3_key',
  )
  if (!workbook) return null
  return downloadObject(workbook.s3_key)
}

async function handleListWorkbooks(_req: Request, res: Response, userId: string): Promise<void> {
  const result = await listOwnedWorkbooks(userId)
  res.json({ workbooks: result.rows })
}

async function handleCreateWorkbook(req: Request, res: Response, userId: string): Promise<void> {
  const payload = readCreateWorkbookBody(req, res)
  if (!payload) return
  if (await exceedsFreeTierWorkbookLimit(userId, res)) return

  const created = await persistNewWorkbook(userId, payload)
  res.status(201).json(created)
  syncCellsAsync(created.id, payload.data, 'create')
}

async function handleDownloadWorkbook(req: Request, res: Response, userId: string): Promise<void> {
  const data = await downloadOwnedWorkbook(workbookIdParam(req), userId, res)
  if (!data) return
  res.setHeader('Content-Type', 'application/json')
  res.send(data)
}

async function handleSaveWorkbook(req: Request, res: Response, userId: string): Promise<void> {
  const payload = readSaveWorkbookBody(req, res)
  if (!payload) return

  const id = workbookIdParam(req)
  const existing = await requireWorkbookOwnership<{ owner_id: string; s3_key: string }>(
    id, userId, res, 'owner_id, s3_key',
  )
  if (!existing) return

  const saved = await persistWorkbookUpdate(userId, id, payload)
  res.json(saved)
  syncCellsAsync(id, payload.data, 'save')
}

async function handleDeleteWorkbook(req: Request, res: Response, userId: string): Promise<void> {
  const id = workbookIdParam(req)
  const workbook = await requireWorkbookOwnership<{ owner_id: string }>(
    id, userId, res, 'owner_id',
  )
  if (!workbook) return

  await query(`UPDATE smartsht.workbooks SET is_deleted = TRUE WHERE id = $1`, [id])
  res.json({ deleted: true })
}

workbooksRouter.get('/', workbookRoute(handleListWorkbooks))
workbooksRouter.post('/', workbookRoute(handleCreateWorkbook))
workbooksRouter.get('/:id', workbookRoute(handleDownloadWorkbook))
workbooksRouter.put('/:id', workbookRoute(handleSaveWorkbook))
workbooksRouter.delete('/:id', workbookRoute(handleDeleteWorkbook))
