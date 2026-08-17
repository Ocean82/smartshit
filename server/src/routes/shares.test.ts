/**
 * Tests for /api/workbooks/:id/share — permission enforcement & ownership.
 *
 * Validates:
 * - Unauthenticated users cannot create share links (401)
 * - Non-owners cannot share someone else's workbook (403)
 * - Requesting 'edit' permission is rejected (400) until implemented
 * - Non-existent workbooks return 404
 * - Valid requests create a share link
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUserId: string | null = 'user_owner'

vi.mock('../auth/clerk.js', () => ({
  getRequestUserId: () => mockUserId,
}))

const mockQueryResults = new Map<string, { rows: Record<string, unknown>[] }>()

vi.mock('../db.js', () => ({
  query: vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('SELECT') && sql.includes('owner_id') && sql.includes('name')) {
      return mockQueryResults.get('select_workbook') ?? { rows: [] }
    }
    if (sql.includes('INSERT INTO smartsht.shares')) {
      return { rows: [{ share_token: 'mock-token-uuid' }] }
    }
    if (sql.includes('SELECT') && sql.includes('share_token')) {
      return mockQueryResults.get('select_share') ?? { rows: [] }
    }
    return { rows: [] }
  }),
}))

vi.mock('../s3.js', () => ({
  downloadObject: vi.fn(async () => JSON.stringify({ sheets: [] })),
}))

vi.mock('../httpError.js', () => ({
  sendServerError: vi.fn((res: express.Response, _context: string, err: unknown) => {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
  }),
}))

import { sharesRouter } from './shares'

// ─── Test App ───────────────────────────────────────────────────────────────

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/workbooks', sharesRouter)
  return app
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('share routes — authentication', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = null
    mockQueryResults.clear()
  })

  it('POST /:id/share returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/workbooks/wb_123/share')
      .send({ permission: 'view' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Authentication required')
  })
})

describe('share routes — ownership enforcement', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_attacker'
    mockQueryResults.clear()
  })

  it('POST /:id/share returns 403 when user does not own the workbook', async () => {
    mockQueryResults.set('select_workbook', {
      rows: [{ owner_id: 'user_real_owner', name: 'Budget' }],
    })

    const res = await request(app)
      .post('/api/workbooks/wb_target/share')
      .send({ permission: 'view' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Access denied')
  })

  it('POST /:id/share returns 404 for non-existent workbook', async () => {
    // Empty result = workbook not found
    const res = await request(app)
      .post('/api/workbooks/wb_nonexistent/share')
      .send({ permission: 'view' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Workbook not found')
  })
})

describe('share routes — edit permission enforcement (P1-4)', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_owner'
    mockQueryResults.clear()
    mockQueryResults.set('select_workbook', {
      rows: [{ owner_id: 'user_owner', name: 'Budget' }],
    })
  })

  it('POST /:id/share rejects permission=edit with 400', async () => {
    const res = await request(app)
      .post('/api/workbooks/wb_123/share')
      .send({ permission: 'edit' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('not supported yet')
  })

  it('POST /:id/share accepts permission=view', async () => {
    const res = await request(app)
      .post('/api/workbooks/wb_123/share')
      .send({ permission: 'view' })

    // Should succeed (201 or 200)
    expect(res.status).toBeLessThan(300)
  })

  it('POST /:id/share defaults to view when no permission specified', async () => {
    const res = await request(app)
      .post('/api/workbooks/wb_123/share')
      .send({})

    // Should succeed — defaults to 'view'
    expect(res.status).toBeLessThan(300)
  })
})

describe('share routes — happy path', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_owner'
    mockQueryResults.clear()
    mockQueryResults.set('select_workbook', {
      rows: [{ owner_id: 'user_owner', name: 'My Budget' }],
    })
  })

  it('creates a share link with expiration', async () => {
    const res = await request(app)
      .post('/api/workbooks/wb_123/share')
      .send({ permission: 'view', expiresIn: '7d' })

    expect(res.status).toBeLessThan(300)
    expect(res.body.shareToken || res.body.token || res.body.shareUrl).toBeDefined()
  })

  it('creates a share link that never expires', async () => {
    const res = await request(app)
      .post('/api/workbooks/wb_123/share')
      .send({ permission: 'view', expiresIn: 'never' })

    expect(res.status).toBeLessThan(300)
  })
})
