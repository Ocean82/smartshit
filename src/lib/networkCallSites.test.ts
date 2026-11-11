/**
 * Static guard (T8): every network call site in non-test src is either gated by
 * serverAccess, token-gated, or explicitly exempt. A new unlisted fetch fails CI.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { stripCommentsAndStrings } from './stripSource'

const ROOT = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.|\.d\.ts$/.test(name)) out.push(p)
  }
  return out
}
const rel = (p: string) => 'src/' + relative(ROOT, p).split(sep).join('/')
const files = walk(ROOT).map((p) => ({ path: rel(p), code: stripCommentsAndStrings(readFileSync(p, 'utf8')) }))
const byPath = (p: string) => files.find((f) => f.path === p)!
const count = (code: string, re: RegExp) => (code.match(re) ?? []).length

// (a) gated-backend files with pinned fetch counts.
const EXPECTED_FETCH_SITES: Record<string, number> = {
  'src/lib/cloudSync.ts': 7,
  'src/components/ShareDialog.tsx': 3,
  'src/components/TemplateGallery.tsx': 3,
  'src/engine/aiFunctionDefinitions.ts': 2,
  'src/ai/agentClient.ts': 2,
  'src/auth/startCheckout.ts': 1,
  'src/auth/useUsage.ts': 1,
  'src/onnx/sseClient.ts': 1,
  // (b) token-gated hooks
  'src/auth/useAutoFixGate.ts': 1,
  'src/auth/useSubscriptionStatus.ts': 2,
  // (c) exempt: same-origin static assets and the public read-only link viewer
  'src/ai/nlp/capabilityEmbeddings.ts': 1,
  'src/ai/nlp/intentEmbeddings.ts': 1,
  'src/ai/nlp/nlp.worker.ts': 2,
  'src/components/SharedView.tsx': 1,
}
// Blocklist regexes for the user-formula sandbox, not call sites.
const EXEMPT_NAMES = new Set(['src/sandbox/validate.ts'])
const GATE_TOKEN = /\b(canCallServer|getAuthStatus)\(/
const TOKEN_GATED = new Set(['src/auth/useAutoFixGate.ts', 'src/auth/useSubscriptionStatus.ts'])
const EXEMPT = new Set([
  'src/ai/nlp/capabilityEmbeddings.ts',
  'src/ai/nlp/intentEmbeddings.ts',
  'src/ai/nlp/nlp.worker.ts',
  'src/components/SharedView.tsx',
  'src/onnx/sseClient.ts', // gated by sseClientAdapter.ts
])

describe('network call sites (T8)', () => {
  it('no unlisted fetch / EventSource / sendBeacon / XHR / WebSocket', () => {
    const offenders: string[] = []
    for (const f of files) {
      if (EXEMPT_NAMES.has(f.path)) continue
      const n = count(f.code, /\bfetch\b/g)
      const other = count(f.code, /\b(EventSource|sendBeacon|XMLHttpRequest)\b|new\s+WebSocket/g)
      if (other > 0) offenders.push(`${f.path}: non-fetch network API`)
      if (n > 0 && EXPECTED_FETCH_SITES[f.path] === undefined) offenders.push(`${f.path}: ${n} unlisted fetch`)
    }
    expect(offenders).toEqual([])
  })

  it('pinned fetch counts match', () => {
    for (const [path, expected] of Object.entries(EXPECTED_FETCH_SITES)) {
      expect({ path, n: count(byPath(path).code, /\bfetch\b/g) }).toEqual({ path, n: expected })
    }
  })

  it('every gated-backend file carries a serverAccess gate token', () => {
    for (const path of Object.keys(EXPECTED_FETCH_SITES)) {
      if (EXEMPT.has(path) || TOKEN_GATED.has(path)) continue
      const code = byPath(path).code
      if (path === 'src/lib/cloudSync.ts') {
        const body = code.slice(code.indexOf('function isCloudConfigured'))
        expect(body.slice(0, 400)).toMatch(/canCallServer\(/)
      } else if (path === 'src/auth/useUsage.ts') {
        expect(code).toMatch(/useAuthStatus\(/)
      } else {
        expect({ path, ok: GATE_TOKEN.test(code) }).toEqual({ path, ok: true })
      }
    }
    expect(byPath('src/onnx/sseClientAdapter.ts').code).toMatch(/canCallServer\(/)
  })

  it('token-gated hooks consult auth status before getToken', () => {
    for (const path of TOKEN_GATED) {
      const code = byPath(path).code
      expect(code.indexOf('getAuthStatus(')).toBeGreaterThan(-1)
      expect(code.indexOf('getAuthStatus(')).toBeLessThan(code.indexOf('await getToken()'))
    }
  })

  it('fetching components react to auth status and guard their helpers', () => {
    for (const path of [
      'src/components/WorkbookPicker.tsx',
      'src/components/VersionHistoryPanel.tsx',
      'src/components/ShareDialog.tsx',
      'src/components/TemplateGallery.tsx',
      'src/App.tsx',
    ]) {
      const code = byPath(path).code
      expect(code).toMatch(/useAuthStatus\(/)
      if (path !== 'src/App.tsx') expect(code).toMatch(/authStatus\]/)
    }
    for (const path of ['src/components/ShareDialog.tsx', 'src/components/TemplateGallery.tsx']) {
      const code = byPath(path).code
      expect(count(code, /canCallServer\(/g)).toBeGreaterThanOrEqual(count(code, /\bfetch\b/g))
    }
  })

  it('getToken( is called in exactly the audited files', () => {
    const callers = files.filter((f) => /\bgetToken\(/.test(f.code)).map((f) => f.path).sort()
    expect(callers).toEqual(
      ['src/auth/useAutoFixGate.ts', 'src/auth/useSubscriptionStatus.ts', 'src/auth/useUsage.ts', 'src/auth/applyAuthTransition.ts'].sort(),
    )
  })

  it('SignInDialog / UserNav make no top-level Clerk hook calls and SignInDialog no fetch', () => {
    const dialog = byPath('src/auth/SignInDialog.tsx').code
    const provider = byPath('src/auth/AuthProvider.tsx').code
    for (const code of [dialog, provider]) expect(code).not.toMatch(/\buse(Auth|User|Session)\(/)
    expect(dialog).not.toMatch(/\bfetch\b/)
  })
})