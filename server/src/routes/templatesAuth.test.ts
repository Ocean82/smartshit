/**
 * Anonymous mode must not weaken the server: handler-level auth on the
 * community-templates write routes still returns 401 and writes nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

let currentUser: string | null = null
vi.mock('../auth/clerk.js', () => ({ getRequestUserId: () => currentUser }))
const queryMock = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }))
vi.mock('../db.js', () => ({ query: (...a: unknown[]) => queryMock(...(a as [])) }))
vi.mock('../s3.js', () => ({
  uploadTemplate: vi.fn(),
  downloadObject: vi.fn(),
}))

import { templatesRouter } from './templates.js'
import { uploadTemplate } from '../s3.js'
import { getAuthMetrics, resetAuthMetrics } from '../auth/authMetrics.js'

const app = express()
app.use(express.json())
app.use('/api/community-templates', templatesRouter)

beforeEach(() => {
  currentUser = null
  queryMock.mockClear()
  vi.mocked(uploadTemplate).mockClear()
})

describe('community-templates auth (anonymous requests)', () => {
  it('POST / (publish) returns 401 with no DB call', async () => {
    const res = await request(app)
      .post('/api/community-templates')
      .send({ name: 'x', category: 'c', prompt: 'p', templateData: { sheets: [] } })
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
    expect(uploadTemplate).not.toHaveBeenCalled()
  })
  it('POST /:id/rate returns 401 with no DB call', async () => {
    const res = await request(app).post('/api/community-templates/abc/rate').send({ rating: 5 })
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
  it('POST /:id/install returns 401 with no DB call and records the denial', async () => {
    resetAuthMetrics()
    const res = await request(app).post('/api/community-templates/abc/install')
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
    const m = getAuthMetrics()
    expect(m.denials).toBe(1)
    expect(m.byReason.no_bearer).toBe(1)
    expect(m.lastDenialPath).toContain('/install')
  })
  it('DELETE /:id returns 401 with no DB call', async () => {
    const res = await request(app).delete('/api/community-templates/abc')
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
})

describe('community-templates install (signed in)', () => {
  it('increments downloads and returns the template', async () => {
    currentUser = 'user_1'
    queryMock.mockResolvedValueOnce({
      rows: [{ name: 'Budget', description: 'd', category: 'c', icon: 'i', prompt: 'p', s3_key: null }],
    })
    const res = await request(app).post('/api/community-templates/abc/install')
    expect(res.status).toBe(200)
    expect(res.body.template.name).toBe('Budget')
    expect(queryMock).toHaveBeenCalledTimes(1)
    // The one query must be the download increment for this published template.
    const [sql, params] = queryMock.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/UPDATE\s+smartsht\.community_templates\s+SET\s+downloads\s*=\s*downloads\s*\+\s*1/i)
    expect(sql).toMatch(/is_published\s*=\s*TRUE/i)
    expect(params).toEqual(['abc'])
  })
})
