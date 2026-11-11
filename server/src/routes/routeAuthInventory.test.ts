/**
 * Static inventory of every HTTP route and how it is gated. A new route must be
 * classified here (and an old row must still exist), so anonymous mode cannot
 * silently widen what an unauthenticated request can reach.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(__dirname, '..')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

type Gate = 'requireAuth' | 'public' | 'handler-auth'

// Routes registered directly on `app` in index.ts: "METHOD path" -> gate.
const APP_ROUTES: Record<string, Gate> = {
  'POST /api/stripe/webhook': 'public', // Stripe signature, no user
  'GET /health': 'public',
  'GET /api/health/ai': 'requireAuth',
  'POST /api/chat/stream': 'requireAuth',
  'POST /api/chat': 'requireAuth',
  'POST /api/usage': 'requireAuth',
  'POST /api/autofix/reserve': 'requireAuth',
  'POST /api/checkout': 'requireAuth',
}

// Router mounts: prefix -> expected gate for the whole router.
const MOUNTS: Array<{ prefix: string; gate: Gate; routerFile?: string }> = [
  { prefix: '/api/workbooks', gate: 'requireAuth' },
  { prefix: '/api/onnx', gate: 'requireAuth' },
  { prefix: '/api/shared', gate: 'public' }, // read-only link viewer, rate limited
  { prefix: '/api/community-templates', gate: 'handler-auth', routerFile: 'routes/templates.ts' },
  { prefix: '/api/ai-function', gate: 'requireAuth', routerFile: 'routes/aiFunction.ts' },
]

// Public community-template routes (allowlisted because they exist today).
const TEMPLATE_PUBLIC = ['get /', 'get /categories', 'post /:id/install']
const TEMPLATE_HANDLER_AUTH = ['post /', 'post /:id/rate', 'delete /:id']

describe('server route auth inventory', () => {
  const index = read('index.ts')

  it('direct app routes match the table in both directions', () => {
    const found = new Map<string, Gate>()
    const re = /app\.(get|post|put|patch|delete)\(\s*'(\/[^']*)'([^\n]*)/g
    for (const m of index.matchAll(re)) {
      found.set(`${m[1].toUpperCase()} ${m[2]}`, /\brequireAuth\b/.test(m[3]) ? 'requireAuth' : 'public')
    }
    expect(Object.fromEntries(found)).toEqual(APP_ROUTES)
  })

  it('router mounts match the table in both directions', () => {
    const found = new Map<string, string>()
    for (const m of index.matchAll(/app\.use\(\s*'(\/api\/[^']*)'([^\n]*)/g)) {
      if (/express\.json|cors|Limiter\)$/.test(m[2]) && !/Router/i.test(m[2])) continue
      if (!/[rR]outer/.test(m[2])) continue
      found.set(m[1], /\brequireAuth\b/.test(m[2]) ? 'requireAuth' : 'none')
    }
    const expected = new Map<string, string>()
    for (const mt of MOUNTS) {
      const mountGate = mt.gate === 'requireAuth' && !mt.routerFile ? 'requireAuth' : 'none'
      expected.set(mt.prefix, mountGate)
    }
    expect(Object.fromEntries(found)).toEqual(Object.fromEntries(expected))
  })

  it('aiFunction router applies requireAuth before its first route', () => {
    const src = read('routes/aiFunction.ts')
    const use = src.indexOf('aiFunctionRouter.use(requireAuth)')
    const first = src.search(/aiFunctionRouter\.(get|post|put|delete)\(/)
    expect(use).toBeGreaterThan(-1)
    expect(use).toBeLessThan(first)
  })

  it('templates router routes match the public / handler-auth split, and handler-auth routes 401 before writing', () => {
    const src = read('routes/templates.ts')
    const routes = [...src.matchAll(/templatesRouter\.(get|post|put|patch|delete)\('([^']*)'/g)].map((m) => `${m[1]} ${m[2]}`)
    expect(routes.sort()).toEqual([...TEMPLATE_PUBLIC, ...TEMPLATE_HANDLER_AUTH].sort())
    for (const r of TEMPLATE_HANDLER_AUTH) {
      const [method, path] = r.split(' ')
      const start = src.indexOf(`templatesRouter.${method}('${path}'`)
      const body = src.slice(start, start + 400)
      expect(body).toMatch(/getUserId\(req\)/)
      expect(body).toMatch(/status\(401\)/)
    }
  })

  it('onnx router relies on its mount-level requireAuth', () => {
    expect(index).toMatch(/app\.use\('\/api\/onnx', requireAuth,/)
  })
})