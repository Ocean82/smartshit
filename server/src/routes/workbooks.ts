import { Router, type Request } from 'express'
import { query } from '../db.js'
import { uploadWorkbook, downloadObject, deleteObject } from '../s3.js'
import { config } from '../config.js'
import { getRequestUserId } from '../auth/clerk.js'
import { syncWorkbookCells } from '../cellStore.js'

export const workbooksRouter = Router()

function getUserId(req: Request): string | null {
  return getRequestUserId(req)
}

// ─── GET /api/workbooks — List user's workbooks ──────────────────────────────

workbooksRouter.get('/', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

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
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/workbooks — Create/save a new workbook ────────────────────────

workbooksRouter.post('/', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { name, data, sheetCount } = req.body as {
    name: string
    data: string // JSON stringified workbook
    sheetCount?: number
  }

  if (!name || !data) {
    res.status(400).json({ error: 'name and data are required' })
    return
  }

  try {
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

    // Async cell sync (don't block the response)
    try {
      const workbookData = JSON.parse(data) as { sheets?: Array<{ name: string; cells: Record<string, { value?: string | number | boolean | null; formula?: string }> }> }
      if (workbookData.sheets?.length) {
        void syncWorkbookCells(workbookId, workbookData.sheets).catch((err) =>
          console.warn('[cellStore] sync failed on create:', err instanceof Error ? err.message : err),
        )
      }
    } catch { /* non-critical */ }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── GET /api/workbooks/:id — Download a workbook ────────────────────────────

workbooksRouter.get('/:id', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params

  try {
    const result = await query<{ s3_key: string; owner_id: string }>(
      `SELECT s3_key, owner_id FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [id],
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Workbook not found' })
      return
    }

    const workbook = result.rows[0]
    if (workbook.owner_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const data = await downloadObject(workbook.s3_key)
    res.setHeader('Content-Type', 'application/json')
    res.send(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── PUT /api/workbooks/:id — Update (save) a workbook ──────────────────────

workbooksRouter.put('/:id', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

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
    const existing = await query<{ owner_id: string; s3_key: string }>(
      `SELECT owner_id, s3_key FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [id],
    )

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Workbook not found' })
      return
    }

    if (existing.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

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

    // Update workbook metadata
    const updateFields: string[] = ['s3_key = $1', 'size_bytes = $2', 'last_saved_at = NOW()']
    const updateParams: unknown[] = [key, sizeBytes]
    let paramIdx = 3

    if (name) {
      updateFields.push(`name = $${paramIdx}`)
      updateParams.push(name)
      paramIdx++
    }

    if (sheetCount !== undefined) {
      updateFields.push(`sheet_count = $${paramIdx}`)
      updateParams.push(sheetCount)
      paramIdx++
    }

    updateParams.push(id)
    await query(
      `UPDATE smartsht.workbooks SET ${updateFields.join(', ')} WHERE id = $${paramIdx}`,
      updateParams,
    )

    // Update user last_seen
    await query(`UPDATE smartsht.users SET last_seen_at = NOW() WHERE id = $1`, [userId])

    res.json({
      saved: true,
      version: nextVersion,
      sizeBytes,
    })

    // Async cell sync (don't block the response)
    try {
      const workbookData = JSON.parse(data) as { sheets?: Array<{ name: string; cells: Record<string, { value?: string | number | boolean | null; formula?: string }> }> }
      if (workbookData.sheets?.length) {
        void syncWorkbookCells(id, workbookData.sheets).catch((err) =>
          console.warn('[cellStore] sync failed on save:', err instanceof Error ? err.message : err),
        )
      }
    } catch { /* non-critical */ }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── DELETE /api/workbooks/:id — Soft-delete a workbook ──────────────────────

workbooksRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params

  try {
    const existing = await query<{ owner_id: string }>(
      `SELECT owner_id FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [id],
    )

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Workbook not found' })
      return
    }

    if (existing.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    await query(`UPDATE smartsht.workbooks SET is_deleted = TRUE WHERE id = $1`, [id])
    res.json({ deleted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})
