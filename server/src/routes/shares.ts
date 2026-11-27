import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { query } from '../db.js'
import { downloadObject } from '../s3.js'
import { getRequestUserId, getClerkClient } from '../auth/clerk.js'
import { sendServerError } from '../httpError.js'

export const sharesRouter = Router()

function getUserId(req: Request): string | null {
  return getRequestUserId(req)
}

const SHARED_BY_MAX = 80

function cleanName(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, SHARED_BY_MAX) : ''
}

/**
 * Resolve the "Shared by" label stored on a share row. Email is only included
 * when the owner ticked includeEmail for this share. Also backfills
 * smartsht.users.display_name/email when Clerk data is available.
 */
async function resolveSharedBy(
  userId: string,
  typedName: unknown,
  includeEmail: boolean,
): Promise<string | null> {
  let name = cleanName(typedName)
  let email = ''
  try {
    const u = await getClerkClient().users.getUser(userId)
    const clerkName = cleanName([u.firstName, u.lastName].filter(Boolean).join(' '))
    const primary = u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress
    email = (primary ?? u.emailAddresses?.[0]?.emailAddress ?? '').trim()
    if (!name) name = clerkName
    await query(
      `UPDATE smartsht.users
       SET display_name = COALESCE(display_name, NULLIF($2, '')),
           email = COALESCE(email, NULLIF($3, ''))
       WHERE id = $1`,
      [userId, clerkName, email],
    )
  } catch {
    // Clerk unavailable: fall back to whatever the user typed.
  }
  if (includeEmail && email) return name ? `${name} (${email})` : email
  return name || null
}

// ─── POST /api/workbooks/:id/share — Create a share link ─────────────────────

sharesRouter.post('/:id/share', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params
  const { permission: requestedPermission, expiresIn, sharedByName, includeEmail } = req.body as {
    sharedByName?: string
    includeEmail?: boolean
    permission?: 'view' | 'edit'
    expiresIn?: '24h' | '7d' | '30d' | 'never'
  }

  // Shared editing is not implemented: GET /api/shared/:token only reads, and
  // no write path consults this column. Persisting 'edit' would advertise a
  // capability that does not exist, so coerce to 'view' until it does.
  if (requestedPermission === 'edit') {
    res.status(400).json({
      error: 'Editable share links are not supported yet. Create a view-only link instead.',
    })
    return
  }
  const permission = 'view'

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

    const sharedBy = await resolveSharedBy(userId, sharedByName, includeEmail === true)

    await query(
      `INSERT INTO smartsht.shares (workbook_id, shared_by, share_token, permission, expires_at, shared_by_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, shareToken, permission, expiresAt, sharedBy],
    )

    res.status(201).json({
      token: shareToken,
      permission,
      expiresAt: expiresAt?.toISOString() ?? null,
      workbookName: workbook.rows[0].name,
    })
  } catch (err) {
    sendServerError(res, 'shares', err)
  }
})

// ─── GET /api/workbooks/:id/shares — List active shares for a workbook ───────

sharesRouter.get('/:id/shares', async (req, res) => {
  const userId = getUserId(req)
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
    sendServerError(res, 'shares', err)
  }
})

// ─── DELETE /api/shares/:token — Revoke a share link ─────────────────────────

// Mounted in index.ts as app.delete('/api/shares/:token', requireAuth, ...).
export async function revokeShareHandler(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req)
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
    sendServerError(res, 'shares', err)
  }
}

// ─── GET /api/shared/:token — Access a shared workbook (PUBLIC) ──────────────
// Mounted at /api/shared (not under the broad /api sharesRouter) so mutating
// /:id/share routes are not also exposed at /api/:id/share.

export const publicSharesRouter = Router()

publicSharesRouter.get('/:token', async (req, res) => {
  const { token } = req.params
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')

  try {
    // Look up the share — check token and expiration
    const shareResult = await query<{
      workbook_id: string
      permission: string
      expires_at: string | null
      shared_by: string
      shared_by_name: string | null
    }>(
      `SELECT s.workbook_id, s.permission, s.expires_at, s.shared_by, s.shared_by_name
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
    const user = await query<{ display_name: string | null }>(
      `SELECT display_name FROM smartsht.users WHERE id = $1`,
      [share.shared_by],
    )
    const sharedByName = share.shared_by_name || user.rows[0]?.display_name || 'Someone'

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
    sendServerError(res, 'shares', err)
  }
})

