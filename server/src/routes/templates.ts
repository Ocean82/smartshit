import { Router, type Request } from 'express'
import { query } from '../db.js'
import { uploadTemplate, downloadObject } from '../s3.js'
import { getRequestUserId } from '../auth/clerk.js'

export const templatesRouter = Router()

function getUserId(req: Request): string | null {
  return getRequestUserId(req)
}

// ─── GET /api/community-templates — Browse community templates ───────────────

templatesRouter.get('/', async (req, res) => {
  const { category, sort, search, limit, offset } = req.query as {
    category?: string
    sort?: 'popular' | 'recent' | 'rating'
    search?: string
    limit?: string
    offset?: string
  }

  try {
    const conditions: string[] = ['is_published = TRUE']
    const params: unknown[] = []
    let paramIdx = 1

    if (category) {
      conditions.push(`category = $${paramIdx}`)
      params.push(category)
      paramIdx++
    }

    if (search) {
      conditions.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`)
      params.push(`%${search}%`)
      paramIdx++
    }

    let orderBy = 'downloads DESC'
    if (sort === 'recent') orderBy = 'created_at DESC'
    else if (sort === 'rating') orderBy = '(CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END) DESC'

    const limitVal = Math.min(parseInt(limit ?? '50', 10), 100)
    const offsetVal = parseInt(offset ?? '0', 10)

    const result = await query(
      `SELECT
         t.id, t.name, t.description, t.category, t.icon, t.prompt,
         t.downloads, t.rating_sum, t.rating_count, t.created_at,
         u.display_name AS author_name, u.email AS author_email
       FROM smartsht.community_templates t
       JOIN smartsht.users u ON u.id = t.author_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limitVal, offsetVal],
    )

    // Get total count for pagination
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM smartsht.community_templates WHERE ${conditions.join(' AND ')}`,
      params,
    )

    const templates = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      icon: row.icon,
      prompt: row.prompt,
      downloads: row.downloads,
      rating: (row.rating_count as number) > 0
        ? Math.round(((row.rating_sum as number) / (row.rating_count as number)) * 10) / 10
        : null,
      ratingCount: row.rating_count,
      author: (row.author_name as string) || (row.author_email as string) || 'Anonymous',
      createdAt: row.created_at,
    }))

    res.json({
      templates,
      total: parseInt(countResult.rows[0].count, 10),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── GET /api/community-templates/categories — List available categories ─────

templatesRouter.get('/categories', async (_req, res) => {
  try {
    const result = await query<{ category: string; count: string }>(
      `SELECT category, COUNT(*) as count
       FROM smartsht.community_templates
       WHERE is_published = TRUE
       GROUP BY category
       ORDER BY count DESC`,
    )

    res.json({ categories: result.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/community-templates — Publish a template ──────────────────────

templatesRouter.post('/', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { name, description, category, icon, prompt, templateData } = req.body as {
    name: string
    description: string
    category: string
    icon?: string
    prompt: string
    templateData?: string // Optional: full template package JSON
  }

  if (!name || !category || !prompt) {
    res.status(400).json({ error: 'name, category, and prompt are required' })
    return
  }

  try {
    // Ensure user exists
    await query(
      `INSERT INTO smartsht.users (id, last_seen_at)
       VALUES ($1, NOW())
       ON CONFLICT (id) DO UPDATE SET last_seen_at = NOW()`,
      [userId],
    )

    // Insert template
    const result = await query<{ id: string }>(
      `INSERT INTO smartsht.community_templates (author_id, name, description, category, icon, prompt)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, name, description ?? '', category, icon ?? '📄', prompt],
    )

    const templateId = result.rows[0].id

    // Optionally upload full template package to S3
    if (templateData) {
      const { key } = await uploadTemplate(templateId, templateData)
      await query(
        `UPDATE smartsht.community_templates SET s3_key = $1 WHERE id = $2`,
        [key, templateId],
      )
    }

    res.status(201).json({ id: templateId, published: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/community-templates/:id/install — Install (download) ──────────

templatesRouter.post('/:id/install', async (req, res) => {
  const { id } = req.params

  try {
    // Increment download count
    const result = await query<{
      name: string
      description: string
      category: string
      icon: string
      prompt: string
      s3_key: string | null
    }>(
      `UPDATE smartsht.community_templates
       SET downloads = downloads + 1
       WHERE id = $1 AND is_published = TRUE
       RETURNING name, description, category, icon, prompt, s3_key`,
      [id],
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Template not found' })
      return
    }

    const template = result.rows[0]

    // If there's a full package in S3, return it
    let templateData: string | null = null
    if (template.s3_key) {
      try {
        templateData = await downloadObject(template.s3_key)
      } catch {
        // S3 object missing — fall back to metadata only
      }
    }

    res.json({
      template: {
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon,
        prompt: template.prompt,
      },
      templateData: templateData ? JSON.parse(templateData) : null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── POST /api/community-templates/:id/rate — Rate a template ────────────────

templatesRouter.post('/:id/rate', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params
  const { rating } = req.body as { rating: number }

  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be between 1 and 5' })
    return
  }

  try {
    // Simple increment — in production you'd track per-user ratings to prevent duplicates
    const result = await query(
      `UPDATE smartsht.community_templates
       SET rating_sum = rating_sum + $1, rating_count = rating_count + 1
       WHERE id = $2 AND is_published = TRUE
       RETURNING rating_sum, rating_count`,
      [rating, id],
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Template not found' })
      return
    }

    res.json({ rated: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

// ─── DELETE /api/community-templates/:id — Unpublish a template ──────────────

templatesRouter.delete('/:id', async (req, res) => {
  const userId = getUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const { id } = req.params

  try {
    const existing = await query<{ author_id: string }>(
      `SELECT author_id FROM smartsht.community_templates WHERE id = $1`,
      [id],
    )

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Template not found' })
      return
    }

    if (existing.rows[0].author_id !== userId) {
      res.status(403).json({ error: 'Access denied' })
      return
    }

    await query(
      `UPDATE smartsht.community_templates SET is_published = FALSE WHERE id = $1`,
      [id],
    )

    res.json({ unpublished: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})
