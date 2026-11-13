/**
 * A bearer token that cannot be decoded must be a 401, not a 500. Uses the real
 * @clerk/express middleware (no network: decoding fails before any key fetch).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { clerkMiddleware } from '@clerk/express'
import { isUndecodableBearer, withMalformedTokenAs401 } from './clerk.js'
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

  it('wrapped: a SyntaxError with a decodable token is an internal fault, not a 401', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const wellFormed = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ sub: 'user_1' })}.c2lnbmF0dXJl`
    const failing: express.RequestHandler = (_req, _res, next) => next(new SyntaxError('internal parse'))
    const res = await request(makeApp(withMalformedTokenAs401(failing))).get('/x').set('Authorization', `Bearer ${wellFormed}`)
    expect(res.status).toBe(500)
    expect(getAuthMetrics().denials).toBe(0)
  })
})

describe('isUndecodableBearer', () => {
  const req = (authorization?: string) => ({ headers: authorization ? { authorization } : {} }) as express.Request
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  it('flags three-part tokens that do not decode', () => {
    for (const t of ['a.b.c', 'eyJ!!!.eyJ.x', `${b64({ alg: 'RS256' })}.not-json.sig`, `${b64({ alg: 'RS256' })}.${b64({ sub: 'x' })}.`]) {
      expect({ t, v: isUndecodableBearer(req(`Bearer ${t}`)) }).toEqual({ t, v: true })
    }
  })
  it('does not flag decodable tokens, non-JWT shapes, or a missing header', () => {
    expect(isUndecodableBearer(req(`Bearer ${b64({ alg: 'RS256' })}.${b64({ sub: 'x' })}.c2ln`))).toBe(false)
    expect(isUndecodableBearer(req('Bearer abc'))).toBe(false) // Clerk treats this as signed out
    expect(isUndecodableBearer(req('Basic a.b.c'))).toBe(false)
    expect(isUndecodableBearer(req())).toBe(false)
  })
})
