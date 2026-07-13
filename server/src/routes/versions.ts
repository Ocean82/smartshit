import { Router } from 'express'
import { query } from '../db.js'
import { uploadWorkbook, downloadObject } from '../s3.js'
import { config } from '../config.js'

export const versionsRouter = Router()

function getUserId(req: { headers: Record<string, unknown>; body?: Record<string, unknown> }): string | null {
  return (
    (req.headers['x-user-id'] as string) ??
    (req.body as Record<string, unknown>)?.userId as string ??
    null
  )
}

// ─── GET /api/workbooks/:id/versions — List version history ──────────────────

versionsRouter.get('/:id/versions', async (req, res) => {
  const userId = getUserId(req as never)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params

  try {
    // Verify ownership
    const workbook = await query<{ owner_id: string }>(
      `SELECT owner_id FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [id],
    )

    if (workbook.rows.length === 0) {
      res.status(404).json({ error: 'Workbook not found' })
      return
    }

    if (workbook.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    const result = await query(
      `SELECT id, version_number, size_bytes, description, created_at
       FROM smartsht.workbook_versions
       WHERE workbook_id = $1
       ORDER BY version_number DESC
       LIMIT 50`,
      [id],
    )

    res.json({ versions: result.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── GET /api/workbooks/:id/versions/:versionId — Download a specific version

versionsRouter.get('/:id/versions/:versionId', async (req, res) => {
  const userId = getUserId(req as never)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id, versionId } = req.params

  try {
    // Verify ownership
    const workbook = await query<{ owner_id: string }>(
      `SELECT owner_id FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [id],
    )

    if (workbook.rows.length === 0) {
      res.status(404).json({ error: 'Workbook not found' })
      return
    }

    if (workbook.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    // Get the version's S3 key
    const version = await query<{ s3_key: string }>(
      `SELECT s3_key FROM smartsht.workbook_versions WHERE id = $1 AND workbook_id = $2`,
      [versionId, id],
    )

    if (version.rows.length === 0) {
      res.status(404).json({ error: 'Version not found' })
      return
    }

    const data = await downloadObject(version.rows[0].s3_key)
    res.setHeader('Content-Type', 'application/json')
    res.send(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/workbooks/:id/versions — Create a named snapshot ──────────────

versionsRouter.post('/:id/versions', async (req, res) => {
  const userId = getUserId(req as never)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params
  const { description } = req.body as { description?: string }

  try {
    // Verify ownership
    const workbook = await query<{ owner_id: string; s3_key: string }>(
      `SELECT owner_id, s3_key FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [id],
    )

    if (workbook.rows.length === 0) {
      res.status(404).json({ error: 'Workbook not found' })
      return
    }

    if (workbook.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    // Download current latest
    const currentData = await downloadObject(workbook.rows[0].s3_key)

    // Get next version number
    const versionResult = await query<{ max_version: number | null }>(
      `SELECT MAX(version_number) as max_version FROM smartsht.workbook_versions WHERE workbook_id = $1`,
      [id],
    )
    const nextVersion = (versionResult.rows[0].max_version ?? 0) + 1

    // Upload snapshot
    const versionFilename = `v${String(nextVersion).padStart(3, '0')}.json`
    const { key, sizeBytes } = await uploadWorkbook(userId, id, versionFilename, currentData)

    // Insert version record
    await query(
      `INSERT INTO smartsht.workbook_versions (workbook_id, version_number, s3_key, size_bytes, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, nextVersion, key, sizeBytes, description ?? 'Manual snapshot'],
    )

    res.status(201).json({
      version: nextVersion,
      sizeBytes,
      description: description ?? 'Manual snapshot',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})
