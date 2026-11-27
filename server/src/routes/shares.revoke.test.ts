/**
 * Revoke (DELETE /api/shares/:token), shared-by resolution, and public GET.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

let mockUserId: string | null = 'user_owner'
let clerkUser: Record<string, unknown> | null = null
let shares: Record<string, unknown>[] = []
let insertParams: unknown[] = []

vi.mock('../auth/clerk.js', () => ({
  getRequestUserId: () => mockUserId,
  getClerkClient: () => ({
    users: {
      getUser: async () => {
        if (!clerkUser) throw new Error('no clerk')
        return clerkUser
      },
    },
  }),
}))

vi.mock('../db.js', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('DELETE FROM smartsht.shares')) {
      shares = shares.filter((s) => s.share_token !== params[0])
      return { rows: [] }
    }
    if (sql.includes('INSERT INTO smartsht.shares')) {
      insertParams = params
      return { rows: [] }
    }
    if (sql.includes('FROM smartsht.shares')) {
      return { rows: shares.filter((s) => s.share_token === params[0]) }
    }
    if (sql.includes('FROM smartsht.workbooks') && sql.includes('s3_key')) {
      return { rows: [{ s3_key: 'k', name: 'Budget', owner_id: 'user_owner' }] }
    }
    if (sql.includes('FROM smartsht.workbooks')) {
      return { rows: [{ owner_id: 'user_owner', name: 'Budget' }] }
    }
    if (sql.includes('FROM smartsht.users')) {
      return { rows: [{ display_name: 'Table Name' }] }
    }
    return { rows: [] }
  }),
}))

vi.mock('../s3.js', () => ({
  downloadObject: vi.fn(async () => JSON.stringify({ sheets: [] })),
}))

import { sharesRouter, publicSharesRouter, revokeShareHandler } from './shares'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/workbooks', sharesRouter)
  app.delete('/api/shares/:token', revokeShareHandler)
  app.use('/api/shared', publicSharesRouter)
  return app
}

const app = createApp()

beforeEach(() => {
  mockUserId = 'user_owner'
  clerkUser = null
  insertParams = []
  shares = [
    { workbook_id: 'wb', permission: 'view', expires_at: null, shared_by: 'user_owner', shared_by_name: null, share_token: 'tok' },
  ]
})

describe('DELETE /api/shares/:token', () => {
  it('401 when unauthenticated', async () => {
    mockUserId = null
    expect((await request(app).delete('/api/shares/tok')).status).toBe(401)
  })

  it('revokes for the owner and the public link then 404s', async () => {
    expect((await request(app).get('/api/shared/tok')).status).toBe(200)
    const res = await request(app).delete('/api/shares/tok')
    expect(res.status).toBe(200)
    expect(res.body.revoked).toBe(true)
    expect((await request(app).get('/api/shared/tok')).status).toBe(404)
  })

  it('403 for a non-owner and keeps the share', async () => {
    mockUserId = 'user_other'
    expect((await request(app).delete('/api/shares/tok')).status).toBe(403)
    expect(shares).toHaveLength(1)
  })

  it('404 for an unknown token', async () => {
    expect((await request(app).delete('/api/shares/nope')).status).toBe(404)
  })
})

describe('shared-by label', () => {
  it('public GET prefers the share row name, then users.display_name', async () => {
    shares[0].shared_by_name = 'Alice'
    expect((await request(app).get('/api/shared/tok')).body.meta.sharedBy).toBe('Alice')
    shares[0].shared_by_name = null
    expect((await request(app).get('/api/shared/tok')).body.meta.sharedBy).toBe('Table Name')
  })

  it('uses the typed name and never adds email unless requested', async () => {
    clerkUser = {
      firstName: 'Clerk', lastName: 'Person', primaryEmailAddressId: 'e1',
      emailAddresses: [{ id: 'e1', emailAddress: 'a@b.com' }],
    }
    await request(app).post('/api/workbooks/wb/share').send({ sharedByName: '  Bob  ' })
    expect(insertParams[5]).toBe('Bob')
    await request(app).post('/api/workbooks/wb/share').send({})
    expect(insertParams[5]).toBe('Clerk Person')
    await request(app).post('/api/workbooks/wb/share').send({ includeEmail: true })
    expect(insertParams[5]).toBe('Clerk Person (a@b.com)')
  })

  it('caps typed names at 80 chars', async () => {
    await request(app).post('/api/workbooks/wb/share').send({ sharedByName: 'x'.repeat(200) })
    expect((insertParams[5] as string).length).toBe(80)
  })
})
