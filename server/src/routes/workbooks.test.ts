/**
 * Unit tests for workbook routes — ownership enforcement and ACL.
 *
 * Validates that:
 * - Unauthenticated requests return 401
 * - User A cannot read/update/delete user B's workbook (403)
 * - Non-existent workbooks return 404
 * - Owner can perform all CRUD operations
 * - Soft-deleted workbooks are invisible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockUserId: string | null = 'user_owner'
let mockIsPro = false

vi.mock('../auth/clerk.js', () => ({
  getRequestUserId: () => mockUserId,
}))

vi.mock('../plan.js', () => ({
  resolveIsPro: async () => mockIsPro,
}))

vi.mock('../config.js', () => ({
  config: {
    s3Prefix: 'smartsht',
    freeCloudWorkbookLimit: 1,
  },
}))

// Mock database — tracks queries for assertions
const mockQueryResults = new Map<string, { rows: Record<string, unknown>[] }>()

vi.mock('../db.js', () => ({
  query: vi.fn(async (sql: string, _params?: unknown[]) => {
    // Match based on the query pattern — order matters (most specific first)
    if (sql.includes('COUNT(*)') && sql.includes('workbooks')) {
      return mockQueryResults.get('count_workbooks') ?? { rows: [{ count: 0 }] }
    }
    if (sql.includes('ORDER BY last_saved_at')) {
      return mockQueryResults.get('list_workbooks') ?? { rows: [] }
    }
    if (sql.includes('SELECT') && sql.includes('owner_id') && sql.includes('s3_key')) {
      return mockQueryResults.get('select_workbook_with_key') ?? { rows: [] }
    }
    if (sql.includes('SELECT') && sql.includes('owner_id')) {
      return mockQueryResults.get('select_workbook_owner') ?? { rows: [] }
    }
    if (sql.includes('INSERT INTO smartsht.workbooks')) {
      return { rows: [{ id: 'wb_new_123' }] }
    }
    if (sql.includes('SELECT MAX(version_number)')) {
      return { rows: [{ max_version: 1 }] }
    }
    return { rows: [] }
  }),
}))

vi.mock('../s3.js', () => ({
  uploadWorkbook: vi.fn(async () => ({ key: 'smartsht/workbooks/user/wb/latest.json', sizeBytes: 1024 })),
  downloadObject: vi.fn(async () => JSON.stringify({ sheets: [] })),
  deleteObject: vi.fn(async () => undefined),
}))

vi.mock('../cellStore.js', () => ({
  syncWorkbookCells: vi.fn(async () => undefined),
}))

vi.mock('../httpError.js', () => ({
  sendServerError: vi.fn((res: express.Response, _context: string, err: unknown) => {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
  }),
}))

import { workbooksRouter } from './workbooks'

// ─── Test app setup ─────────────────────────────────────────────────────────

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/workbooks', workbooksRouter)
  return app
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('workbook routes — authentication', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = null
    mockIsPro = false
    mockQueryResults.clear()
  })

  it('GET /api/workbooks returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/workbooks')
    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Authentication required')
  })

  it('POST /api/workbooks returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/workbooks')
      .send({ name: 'Test', data: '{}' })
    expect(res.status).toBe(401)
  })

  it('GET /api/workbooks/:id returns 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/workbooks/wb_123')
    expect(res.status).toBe(401)
  })

  it('PUT /api/workbooks/:id returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .put('/api/workbooks/wb_123')
      .send({ data: '{}' })
    expect(res.status).toBe(401)
  })

  it('DELETE /api/workbooks/:id returns 401 when unauthenticated', async () => {
    const res = await request(app).delete('/api/workbooks/wb_123')
    expect(res.status).toBe(401)
  })
})

describe('workbook routes — ownership enforcement', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_attacker'
    mockIsPro = false
    mockQueryResults.clear()
  })

  it('GET /api/workbooks/:id returns 403 when user does not own the workbook', async () => {
    mockQueryResults.set('select_workbook_with_key', {
      rows: [{ s3_key: 'some/key.json', owner_id: 'user_owner' }],
    })

    const res = await request(app).get('/api/workbooks/wb_target')
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Access denied')
  })

  it('PUT /api/workbooks/:id returns 403 when user does not own the workbook', async () => {
    mockQueryResults.set('select_workbook_with_key', {
      rows: [{ s3_key: 'some/key.json', owner_id: 'user_owner' }],
    })

    const res = await request(app)
      .put('/api/workbooks/wb_target')
      .send({ data: '{"sheets":[]}' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Access denied')
  })

  it('DELETE /api/workbooks/:id returns 403 when user does not own the workbook', async () => {
    mockQueryResults.set('select_workbook_owner', {
      rows: [{ owner_id: 'user_owner' }],
    })

    const res = await request(app).delete('/api/workbooks/wb_target')
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Access denied')
  })
})

describe('workbook routes — not found', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_owner'
    mockIsPro = false
    mockQueryResults.clear()
    // Empty results = workbook doesn't exist (or is soft-deleted)
  })

  it('GET /api/workbooks/:id returns 404 for non-existent workbook', async () => {
    const res = await request(app).get('/api/workbooks/wb_nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Workbook not found')
  })

  it('PUT /api/workbooks/:id returns 404 for non-existent workbook', async () => {
    const res = await request(app)
      .put('/api/workbooks/wb_nonexistent')
      .send({ data: '{}' })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Workbook not found')
  })

  it('DELETE /api/workbooks/:id returns 404 for non-existent workbook', async () => {
    const res = await request(app).delete('/api/workbooks/wb_nonexistent')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Workbook not found')
  })

  it('soft-deleted workbooks are treated as not found', async () => {
    // The SQL query includes "AND NOT is_deleted", so soft-deleted workbooks
    // return empty rows — same as non-existent.
    const res = await request(app).get('/api/workbooks/wb_deleted')
    expect(res.status).toBe(404)
  })
})

describe('workbook routes — owner access (happy path)', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_owner'
    mockIsPro = false
    mockQueryResults.clear()
  })

  it('GET /api/workbooks lists the authenticated user workbooks', async () => {
    mockQueryResults.set('list_workbooks', {
      rows: [
        { id: 'wb_1', name: 'Budget', size_bytes: 512, sheet_count: 2, last_saved_at: '2026-08-01', created_at: '2026-07-01' },
      ],
    })

    const res = await request(app).get('/api/workbooks')
    expect(res.status).toBe(200)
    expect(res.body.workbooks).toHaveLength(1)
    expect(res.body.workbooks[0].name).toBe('Budget')
  })

  it('GET /api/workbooks/:id returns data when user owns the workbook', async () => {
    mockQueryResults.set('select_workbook_with_key', {
      rows: [{ s3_key: 'smartsht/workbooks/user_owner/wb_mine/latest.json', owner_id: 'user_owner' }],
    })

    const res = await request(app).get('/api/workbooks/wb_mine')
    expect(res.status).toBe(200)
  })

  it('DELETE /api/workbooks/:id soft-deletes when user owns the workbook', async () => {
    mockQueryResults.set('select_workbook_owner', {
      rows: [{ owner_id: 'user_owner' }],
    })

    const res = await request(app).delete('/api/workbooks/wb_mine')
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })
})

describe('workbook routes — free-tier cloud limit', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_free'
    mockIsPro = false
    mockQueryResults.clear()
  })

  it('POST /api/workbooks returns 403 when free user already at the cloud limit', async () => {
    mockQueryResults.set('count_workbooks', { rows: [{ count: 1 }] })

    const res = await request(app)
      .post('/api/workbooks')
      .send({ name: 'Second', data: '{}' })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FREE_CLOUD_WORKBOOK_LIMIT')
    expect(res.body.limit).toBe(1)
  })

  it('POST /api/workbooks allows Pro users past the free limit', async () => {
    mockIsPro = true
    mockQueryResults.set('count_workbooks', { rows: [{ count: 5 }] })

    const res = await request(app)
      .post('/api/workbooks')
      .send({ name: 'Pro Extra', data: '{}' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('wb_new_123')
  })

  it('POST /api/workbooks allows a free user with zero existing workbooks', async () => {
    mockQueryResults.set('count_workbooks', { rows: [{ count: 0 }] })

    const res = await request(app)
      .post('/api/workbooks')
      .send({ name: 'First', data: '{}' })

    expect(res.status).toBe(201)
  })
})

describe('workbook routes — input validation', () => {
  const app = createApp()

  beforeEach(() => {
    mockUserId = 'user_owner'
    mockIsPro = false
    mockQueryResults.clear()
  })

  it('POST /api/workbooks returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/workbooks')
      .send({ data: '{}' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('required')
  })

  it('POST /api/workbooks returns 400 when data is missing', async () => {
    const res = await request(app)
      .post('/api/workbooks')
      .send({ name: 'Test' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('required')
  })

  it('PUT /api/workbooks/:id returns 400 when data is missing', async () => {
    const res = await request(app)
      .put('/api/workbooks/wb_123')
      .send({ name: 'Renamed' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('required')
  })
})
