/**
 * A bearer token that cannot be decoded must be a 401, not a 500. Uses the real
 * @clerk/express middleware (no network: decoding fails before any key fetch).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { clerkMiddleware } from '@clerk/express'
import { withMalformedTokenAs401 } from './clerk.js'
import { getAuthMetrics, resetAuthMetrics } from './authMetrics.js'

const publishableKey = 'pk_test_' + Buffer.from('clerk.example.com$').toString('base64').replace(/=+$/, '')

function makeApp(clerk: express.RequestHandler) {
  const app = express()
  app.use(clerk)
  app.get('/x', (_req, res) => res.json({ ok: true }))
  // Mirrors index.ts: an unhandled error becomes a 500.
  app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: 'unhandled' })
  })
  return app
}

const real = () => clerkMiddleware({ publishableKey, secretKey: 'sk_test_dummy', authorizedParties: [] })

beforeEach(() => resetAuthMetrics())

describe('malformed bearer token', () => {
  it('unwrapped Clerk middleware answers 500 (the bug this guards)', async () => {
    const res = await request(makeApp(real())).get('/x').set('Authorization', 'Bearer a.b.c')
    expect(res.status).toBe(500)
  })

  it.each(['a.b.c', 'eyJ!!!.eyJ.x'])('wrapped: Bearer %s -> 401 and a recorded denial', async (token) => {
    const res = await request(makeApp(withMalformedTokenAs401(real()))).get('/x').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Authentication required' })
    expect(getAuthMetrics().byReason.no_session).toBe(1)
  })

  it('wrapped: no Authorization header still reaches public routes', async () => {
    const res = await request(makeApp(withMalformedTokenAs401(real()))).get('/x')
    expect(res.status).toBe(200)
  })

  it('wrapped: non-decode errors are not swallowed', async () => {
    const failing: express.RequestHandler = (_req, _res, next) => next(new Error('JWKS fetch failed'))
    const res = await request(makeApp(withMalformedTokenAs401(failing))).get('/x').set('Authorization', 'Bearer a.b.c')
    expect(res.status).toBe(500)
  })

  it('wrapped: a SyntaxError without a bearer is not turned into a 401', async () => {
    const failing: express.RequestHandler = (_req, _res, next) => next(new SyntaxError('bad'))
    const res = await request(makeApp(withMalformedTokenAs401(failing))).get('/x')
    expect(res.status).toBe(500)
  })
})
