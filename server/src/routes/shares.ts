import { Router, type Request } from 'express'
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { downloadObject } from '../s3.js'
import { getRequestUserId } from '../auth/clerk.js'

export const sharesRouter = Router()

function getUserId(req: Request): string | null {
  return getRequestUserId(req)
}

// ─── POST /api/workbooks/:id/share — Create a share link ─────────────────────

sharesRouter.post('/:id/share', async (req, res) => {
  const userId = getUserId(req as never)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params
  const { permission, expiresIn } = req.body as {
    permission?: 'view' | 'edit'
    expiresIn?: '24h' | '7d' | '30d' | 'never'
  }

  try {
    // Verify ownership
    const workbook = await query<{ owner_id: string; name: string }>(
      `SELECT owner_id, name FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
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

    // Calculate expiration
    let expiresAt: Date | null = null
    if (expiresIn && expiresIn !== 'never') {
      expiresAt = new Date()
      switch (expiresIn) {
        case '24h':
          expiresAt.setHours(expiresAt.getHours() + 24)
          break
        case '7d':
          expiresAt.setDate(expiresAt.getDate() + 7)
          break
        case '30d':
          expiresAt.setDate(expiresAt.getDate() + 30)
          break
      }
    }

    // Generate share token
    const shareToken = randomUUID()

    await query(
      `INSERT INTO smartsht.shares (workbook_id, shared_by, share_token, permission, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, shareToken, permission ?? 'view', expiresAt],
    )

    res.status(201).json({
      token: shareToken,
      permission: permission ?? 'view',
      expiresAt: expiresAt?.toISOString() ?? null,
      workbookName: workbook.rows[0].name,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── GET /api/workbooks/:id/shares — List active shares for a workbook ───────

sharesRouter.get('/:id/shares', async (req, res) => {
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
      `SELECT id, share_token, permission, expires_at, created_at
       FROM smartsht.shares
       WHERE workbook_id = $1
       ORDER BY created_at DESC`,
      [id],
    )

    res.json({ shares: result.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── DELETE /api/shares/:token — Revoke a share link ─────────────────────────

sharesRouter.delete('/shares/:token', async (req, res) => {
  const userId = getUserId(req as never)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { token } = req.params

  try {
    // Verify the share belongs to this user
    const share = await query<{ shared_by: string }>(
      `SELECT shared_by FROM smartsht.shares WHERE share_token = $1`,
      [token],
    )

    if (share.rows.length === 0) {
      res.status(404).json({ error: 'Share not found' })
      return
    }

    if (share.rows[0].shared_by !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    await query(`DELETE FROM smartsht.shares WHERE share_token = $1`, [token])
    res.json({ revoked: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── GET /api/shared/:token — Access a shared workbook (PUBLIC) ──────────────

sharesRouter.get('/shared/:token', async (req, res) => {
  const { token } = req.params

  try {
    // Look up the share — check token and expiration
    const shareResult = await query<{
      workbook_id: string
      permission: string
      expires_at: string | null
      shared_by: string
    }>(
      `SELECT s.workbook_id, s.permission, s.expires_at, s.shared_by
       FROM smartsht.shares s
       WHERE s.share_token = $1`,
      [token],
    )

    if (shareResult.rows.length === 0) {
      res.status(404).json({ error: 'Share link not found or has been revoked' })
      return
    }

    const share = shareResult.rows[0]

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      res.status(410).json({ error: 'This share link has expired' })
      return
    }

    // Get workbook metadata + S3 key
    const workbook = await query<{ s3_key: string; name: string; owner_id: string }>(
      `SELECT s3_key, name, owner_id FROM smartsht.workbooks WHERE id = $1 AND NOT is_deleted`,
      [share.workbook_id],
    )

    if (workbook.rows.length === 0) {
      res.status(404).json({ error: 'Workbook no longer exists' })
      return
    }

    // Get sharer's display name
    const user = await query<{ display_name: string | null; email: string | null }>(
      `SELECT display_name, email FROM smartsht.users WHERE id = $1`,
      [share.shared_by],
    )
    const sharedByName = user.rows[0]?.display_name || user.rows[0]?.email || 'Someone'

    // Download the workbook data from S3
    const data = await downloadObject(workbook.rows[0].s3_key)

    res.json({
      workbook: JSON.parse(data),
      meta: {
        name: workbook.rows[0].name,
        permission: share.permission,
        sharedBy: sharedByName,
        expiresAt: share.expires_at,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})
