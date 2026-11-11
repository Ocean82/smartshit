/**
 * Anonymous mode must not weaken the server: handler-level auth on the
 * community-templates write routes still returns 401 and writes nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

vi.mock('../auth/clerk.js', () => ({ getRequestUserId: () => null }))
const queryMock = vi.fn(async () => ({ rows: [] as Record<string, unknown>[] }))
vi.mock('../db.js', () => ({ query: (...a: unknown[]) => queryMock(...(a as [])) }))
vi.mock('../s3.js', () => ({
  uploadTemplate: vi.fn(),
  downloadObject: vi.fn(),
}))

import { templatesRouter } from './templates.js'

const app = express()
app.use(express.json())
app.use('/api/community-templates', templatesRouter)

beforeEach(() => queryMock.mockClear())

describe('community-templates auth (anonymous requests)', () => {
  it('POST / (publish) returns 401 with no DB call', async () => {
    const res = await request(app).post('/api/community-templates').send({ name: 'x', category: 'c', prompt: 'p' })
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
  it('POST /:id/rate returns 401 with no DB call', async () => {
    const res = await request(app).post('/api/community-templates/abc/rate').send({ rating: 5 })
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
  it('DELETE /:id returns 401 with no DB call', async () => {
    const res = await request(app).delete('/api/community-templates/abc')
    expect(res.status).toBe(401)
    expect(queryMock).not.toHaveBeenCalled()
  })
})