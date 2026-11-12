/**
 * Tests for /api/workbooks/:id/versions — server-side Pro enforcement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

let mockUserId: string | null = 'user_owner'
let mockIsPro = false

vi.mock('../auth/clerk.js', () => ({
  getRequestUserId: () => mockUserId,
}))
vi.mock('../plan.js', () => ({
  resolveIsPro: async () => mockIsPro,
}))

const mockQuery = vi.fn(async (sql: string, _params?: unknown[]) => {
  if (sql.includes('owner_id')) return { rows: [{ owner_id: 'user_owner', s3_key: 'k' }] }
  if (sql.includes('s3_key')) return { rows: [{ s3_key: 'k' }] }
  return { rows: [] }
})
vi.mock('../db.js', () => ({
  query: (...args: unknown[]) => mockQuery(...(args as [string, unknown[]?])),
  getPool: () => ({
    connect: async () => ({
      query: (...args: unknown[]) => mockQuery(...(args as [string, unknown[]?])),
      release: () => {},
    }),
  }),
}))
vi.mock('../s3.js', () => ({
  downloadObject: vi.fn(async () => '{}'),
  uploadWorkbook: vi.fn(async () => ({ key: 'k2', sizeBytes: 2 })),
}))
vi.mock('../httpError.js', () => ({
  sendServerError: vi.fn((res: express.Response, _c: string, err: unknown) => {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' })
  }),
}))

import { versionsRouter } from './versions'

const app = express()
app.use(express.json())
app.use('/api/workbooks', versionsRouter)

describe('version routes — Pro enforcement', () => {
  beforeEach(() => {
    mockUserId = 'user_owner'
    mockIsPro = false
    mockQuery.mockClear()
  })

  it('returns 401 when unauthenticated', async () => {
    mockUserId = null
    const res = await request(app).get('/api/workbooks/wb_1/versions')
    expect(res.status).toBe(401)
  })

  it.each([
    ['GET', '/api/workbooks/wb_1/versions'],
    ['GET', '/api/workbooks/wb_1/versions/v_1'],
    ['POST', '/api/workbooks/wb_1/versions'],
  ])('free user gets 403 PRO_REQUIRED on %s %s without touching the DB', async (method, url) => {
    const res = await (method === 'GET' ? request(app).get(url) : request(app).post(url).send({}))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('PRO_REQUIRED')
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('Pro owner can list versions', async () => {
    mockIsPro = true
    const res = await request(app).get('/api/workbooks/wb_1/versions')
    expect(res.status).toBe(200)
    expect(res.body.versions).toEqual([])
  })
})
