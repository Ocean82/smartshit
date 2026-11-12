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

// EVERY `app.<method|all|use>(` registration in index.ts, in source order, as
// "METHOD path binding gate". `binding` is the mounted router / middleware name
// ("inline" for an inline function, "route" for a handler route). `gate` is
// requireAuth when it appears before the final argument, else public. A new,
// removed, re-ordered-into-ungated or renamed registration fails the test.
const EXPECTED_APP_REGISTRATIONS = [
  'USE * cors public',
  'USE * inline public',
  'POST /api/stripe/webhook route public', // Stripe signature, no user
  'USE * clerkMiddleware public',
  'USE /api/workbooks express.json public',
  'USE * express.json public',
  'USE * globalRateLimiter public',
  'USE /api/workbooks workbooksRouter requireAuth',
  'USE /api/workbooks versionsRouter requireAuth',
  'USE /api/workbooks sharesRouter requireAuth',
  'USE /api/shared publicSharesRouter public', // read-only link viewer, rate limited
  'USE /api/community-templates templatesRouter public', // handler-auth, checked below
  'USE /api/ai-function aiFunctionRouter public', // router-level requireAuth, checked below
  'USE /api/onnx createOnnxRouter requireAuth',
  'GET /health route public',
  'GET /api/health/ai route requireAuth',
  'POST /api/chat/stream route requireAuth',
  'POST /api/chat route requireAuth',
  'POST /api/usage route requireAuth',
  'POST /api/autofix/reserve route requireAuth',
  'POST /api/checkout route requireAuth',
  'USE * inline public', // error handler
]

/** Top-level arguments of a call whose text starts right after `(` (single line). */
function topLevelArgs(s: string): string[] {
  const args: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (depth === 0 && ch === ')') break
    if ('({['.includes(ch)) depth++
    if (')}]'.includes(ch)) depth--
    if (depth === 0 && ch === ',') {
      args.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  args.push(cur.trim())
  return args
}
const bindingName = (a: string) => (/^\(|^async\b|=>/.test(a) ? 'inline' : (a.match(/^[\w.]+/)?.[0] ?? a))

function appRegistrations(index: string): string[] {
  const out: string[] = []
  for (const m of index.matchAll(/\bapp\.(get|post|put|patch|delete|all|use)\(([^\n]*)/g)) {
    const args = topLevelArgs(m[2])
    const pathMatch = /^'([^']*)'$/.exec(args[0])
    const path = pathMatch ? pathMatch[1] : '*'
    const rest = pathMatch ? args.slice(1) : args
    const gate = rest.slice(0, -1).some((a) => bindingName(a) === 'requireAuth') ? 'requireAuth' : 'public'
    const binding = m[1] === 'use' ? bindingName(rest[rest.length - 1] ?? '') : 'route'
    out.push(`${m[1].toUpperCase()} ${path} ${binding} ${gate}`)
  }
  return out
}

// Public community-template routes (allowlisted because they exist today).
const TEMPLATE_PUBLIC = ['get /', 'get /categories', 'post /:id/install']
const TEMPLATE_HANDLER_AUTH = ['post /', 'post /:id/rate', 'delete /:id']

describe('server route auth inventory', () => {
  const index = read('index.ts')

  it('every app registration (routes, all, and every use mount) matches the table', () => {
    // Each mount is its own row, so three routers sharing /api/workbooks are all
    // checked for identity and gate; nothing is overwritten or skipped.
    expect(appRegistrations(index)).toEqual(EXPECTED_APP_REGISTRATIONS)
  })

  it('the parser flags an ungated or unknown mount', () => {
    const tampered = index
      .replace("app.use('/api/workbooks', requireAuth, versionsRouter)", "app.use('/api/workbooks', versionsRouter)")
      .concat("\napp.all('/api/x', handler)\n")
    const found = appRegistrations(tampered)
    expect(found).toContain('USE /api/workbooks versionsRouter public')
    expect(found).toContain('ALL /api/x route public')
    expect(found).not.toEqual(EXPECTED_APP_REGISTRATIONS)
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