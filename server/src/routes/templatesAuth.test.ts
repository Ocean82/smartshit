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

import { templatesRouter, INSTALL_SQL } from './templates.js'
import { uploadTemplate } from '../s3.js'
import { getAuthMetrics, resetAuthMetrics } from '../auth/authMetrics.js'

const app = express()
app.use(express.json())
app.use('/api/community-templates', templatesRouter)

beforeEach(() => {
  currentUser = null
  // Reset (not just clear) so a queued mockResolvedValueOnce from one test can
  // never leak into the next.
  queryMock.mockReset()
  queryMock.mockImplementation(async () => ({ rows: [] }))
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
  const row = { name: 'Budget', description: 'd', category: 'c', icon: 'i', prompt: 'p', s3_key: null }

  it('runs the per-user dedup statement once, keyed by template and the signed-in user', async () => {
    currentUser = 'user_1'
    queryMock.mockResolvedValueOnce({ rows: [row] })
    const res = await request(app).post('/api/community-templates/abc/install')
    expect(res.status).toBe(200)
    expect(res.body.template.name).toBe('Budget')
    expect(queryMock).toHaveBeenCalledTimes(1)
    // Semantics of INSTALL_SQL are checked against real Postgres outside this
    // suite; here we pin that the route uses it with (template id, user id).
    const [sql, params] = queryMock.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toBe(INSTALL_SQL)
    expect(sql).toMatch(/INSERT INTO smartsht\.template_installs[\s\S]*ON CONFLICT \(user_id, template_id\) DO NOTHING/)
    expect(sql).toMatch(/SET downloads = c\.downloads \+ 1\s+FROM first_install/)
    // Placeholders: $1 is the template id (t filter), $2 the user id (install row).
    expect(sql).toMatch(/WHERE id = \$1 AND is_published = TRUE/)
    expect(sql).toMatch(/INSERT INTO smartsht\.template_installs \(user_id, template_id\)\s+SELECT \$2, id FROM t/)
    expect(params).toEqual(['abc', 'user_1'])
  })

  it('before migration 007 (relation missing) it serves the template read-only, not a 500', async () => {
    currentUser = 'user_1'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    queryMock
      .mockRejectedValueOnce(Object.assign(new Error('relation "smartsht.template_installs" does not exist'), { code: '42P01' }))
      .mockResolvedValueOnce({ rows: [row] })
    const res = await request(app).post('/api/community-templates/abc/install')
    expect(res.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(2)
    const [fallbackSql, fallbackParams] = queryMock.mock.calls[1] as unknown as [string, unknown[]]
    // Read-only: no repeat-install inflation while the table is missing.
    expect(fallbackSql).toMatch(/^SELECT name, description, category, icon, prompt, s3_key\s+FROM smartsht\.community_templates\s+WHERE id = \$1 AND is_published = TRUE$/)
    expect(fallbackSql).not.toMatch(/UPDATE|INSERT|downloads/i)
    expect(fallbackParams).toEqual(['abc'])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('migration 007'))
    warn.mockRestore()
  })

  it('any other DB error is not swallowed by the fallback', async () => {
    currentUser = 'user_1'
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    queryMock.mockRejectedValueOnce(Object.assign(new Error('connection lost'), { code: '08006' }))
    const res = await request(app).post('/api/community-templates/abc/install')
    expect(res.status).toBe(500)
    expect(queryMock).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })

  it('unknown or unpublished template is a 404', async () => {
    currentUser = 'user_1'
    queryMock.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).post('/api/community-templates/abc/install')
    expect(res.status).toBe(404)
  })
})
