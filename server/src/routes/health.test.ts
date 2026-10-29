/**
 * Tests for the strict readiness behavior of /health (?strict=1).
 *
 * The deploy gate (scripts/deploy.sh) relies on `curl -f` failing when a
 * deploy-critical subsystem is down. Plain /health always returns 200 and only
 * reflects AI-provider liveness, so a DB/S3/Clerk failure must surface as 503
 * in strict mode — otherwise a broken deploy is reported healthy and rollback
 * never fires.
 *
 * We replicate the strict handler here (as chat.test.ts does) rather than
 * booting the full app, to isolate from Clerk/DB/S3 initialization. The logic
 * under test — "503 unless db.ok && s3.ok && clerk.ok" plus diagnostics access —
 * mirrors production via shouldShowHealthDiagnostics.
 */
import { describe, it, expect } from 'vitest'
import express from 'express'
import request from 'supertest'
import { shouldShowHealthDiagnostics } from '../healthAccess.js'

type SubsystemHealth = { ok: boolean; error?: string }

interface Deps {
  dbHealthCheck: () => Promise<SubsystemHealth>
  s3HealthCheck: () => Promise<SubsystemHealth>
  clerkConfigured: boolean
  /** Simulate an authenticated operator (production reads getRequestUserId). */
  authenticated?: boolean
}

function createHealthApp(deps: Deps) {
  const app = express()
  app.get('/health', async (req, res) => {
    const isOk = true // liveness stand-in; strict path ignores it for readiness
    if (req.query.strict !== undefined && req.query.strict !== '0') {
      const [db, s3] = await Promise.all([deps.dbHealthCheck(), deps.s3HealthCheck()])
      const clerk = {
        ok: deps.clerkConfigured,
        mode: 'config' as const,
        publishableKeyConfigured: true,
        authorizedPartyCount: 2,
        error: deps.clerkConfigured ? undefined : 'CLERK_SECRET_KEY not configured',
      }
      const ready = db.ok && s3.ok && clerk.ok

      // Mirror production: peer is real TCP address; X-Test-Peer exists ONLY in
      // this replica to simulate a non-loopback public caller.
      const peer = (req.header('X-Test-Peer') ?? req.socket.remoteAddress) ?? ''
      const showDiagnostics = shouldShowHealthDiagnostics({
        peer,
        forwardedFor: req.header('X-Forwarded-For') ?? undefined,
        authenticated: Boolean(deps.authenticated),
      })

      res.status(ready ? 200 : 503).json({
        ok: ready,
        mode: 'strict',
        liveness: isOk,
        ...(showDiagnostics ? { critical: { database: db, s3, clerk } } : {}),
      })
      return
    }
    res.json({ ok: isOk, service: 'smartsht-server' })
  })
  return app
}

const healthy: Deps = {
  dbHealthCheck: async () => ({ ok: true }),
  s3HealthCheck: async () => ({ ok: true }),
  clerkConfigured: true,
}

describe('/health strict readiness', () => {
  it('plain /health returns 200 even when a critical subsystem is down (liveness only)', async () => {
    const app = createHealthApp({ ...healthy, dbHealthCheck: async () => ({ ok: false, error: 'down' }) })
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
  })

  it('strict returns 200 when DB, S3, and Clerk are all healthy', async () => {
    const res = await request(createHealthApp(healthy)).get('/health?strict=1')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.mode).toBe('strict')
  })

  it('strict returns 503 when the database is down', async () => {
    const app = createHealthApp({ ...healthy, dbHealthCheck: async () => ({ ok: false, error: 'ECONNREFUSED' }) })
    const res = await request(app).get('/health?strict=1')
    expect(res.status).toBe(503)
    expect(res.body.ok).toBe(false)
    expect(res.body.critical.database.ok).toBe(false)
  })

  it('strict returns 503 when S3 is down', async () => {
    const app = createHealthApp({ ...healthy, s3HealthCheck: async () => ({ ok: false, error: 'AccessDenied' }) })
    const res = await request(app).get('/health?strict=1')
    expect(res.status).toBe(503)
    expect(res.body.critical.s3.ok).toBe(false)
  })

  it('strict returns 503 when Clerk is not configured', async () => {
    const app = createHealthApp({ ...healthy, clerkConfigured: false })
    const res = await request(app).get('/health?strict=1')
    expect(res.status).toBe(503)
    expect(res.body.critical.clerk.ok).toBe(false)
  })

  it('strict=0 is treated as non-strict (lenient 200)', async () => {
    const app = createHealthApp({ ...healthy, dbHealthCheck: async () => ({ ok: false }) })
    const res = await request(app).get('/health?strict=0')
    expect(res.status).toBe(200)
  })

  // ─── Diagnostics leak guard ────────────────────────────────────────────────
  // The strict body must not leak raw DB/S3 driver errors to the public. The
  // deploy gate (direct loopback, no X-Forwarded-For) and authenticated
  // operators still see them. Nginx-proxied peers also look like loopback.

  it('loopback caller still gets the critical diagnostics (deploy gate path)', async () => {
    // supertest connects over loopback with no X-Forwarded-For.
    const app = createHealthApp({ ...healthy, dbHealthCheck: async () => ({ ok: false, error: 'ECONNREFUSED db.internal:5432' }) })
    const res = await request(app).get('/health?strict=1')
    expect(res.status).toBe(503)
    expect(res.body.critical.database.error).toBe('ECONNREFUSED db.internal:5432')
  })

  it('anonymous public caller gets status only — no critical diagnostics', async () => {
    const app = createHealthApp({ ...healthy, dbHealthCheck: async () => ({ ok: false, error: 'ECONNREFUSED db.internal:5432' }) })
    const res = await request(app)
      .get('/health?strict=1')
      .set('X-Test-Peer', '203.0.113.7')
    expect(res.status).toBe(503) // status still reflects readiness
    expect(res.body.ok).toBe(false)
    expect(res.body.critical).toBeUndefined() // but no raw error leaks
  })

  it('nginx-proxied loopback peer without auth does not get diagnostics', async () => {
    const app = createHealthApp({ ...healthy, dbHealthCheck: async () => ({ ok: false, error: 'ECONNREFUSED db.internal:5432' }) })
    const res = await request(app)
      .get('/health?strict=1')
      .set('X-Forwarded-For', '203.0.113.7')
    expect(res.status).toBe(503)
    expect(res.body.critical).toBeUndefined()
  })

  it('authenticated operator from a public peer still gets diagnostics', async () => {
    const app = createHealthApp({ ...healthy, authenticated: true, dbHealthCheck: async () => ({ ok: false, error: 'ECONNREFUSED' }) })
    const res = await request(app).get('/health?strict=1').set('X-Test-Peer', '203.0.113.7')
    expect(res.status).toBe(503)
    expect(res.body.critical.database.ok).toBe(false)
  })
})
