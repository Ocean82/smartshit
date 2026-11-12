#!/usr/bin/env node
// Fails the deploy when the built frontend does not carry a real Clerk
// publishable key. Anonymous mode no longer hangs loudly on a bad key (the grid
// works and sign-in silently dies), so we check the bundle instead.
// Usage: node scripts/check-clerk-key.mjs [distAssetsDir]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? join('dist', 'assets')
let files = []
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.js'))
} catch {
  console.error(`check-clerk-key: cannot read ${dir}`)
  process.exit(1)
}

const KEY = /pk_(?:live|test)_[A-Za-z0-9+/=$]{20,}/g
const matches = new Set()
let placeholder = false
for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8')
  for (const m of text.matchAll(KEY)) matches.add(m[0])
  if (/pk_live_YOUR/i.test(text)) placeholder = true
}

if (matches.size === 0) {
  console.error('check-clerk-key: FAIL rule 1: no pk_live_/pk_test_ key found in the built bundle')
  process.exit(1)
}
if (placeholder || [...matches].some((m) => /YOUR_/i.test(m))) {
  console.error('check-clerk-key: FAIL rule 2: bundle contains a placeholder Clerk key (YOUR_...)')
  process.exit(1)
}

// A publishable key is pk_(live|test)_ + base64("<frontend-api-host>$").
function isValidPublishableKey(key) {
  const body = key.replace(/^pk_(?:live|test)_/, '')
  // Buffer.from never throws on bad base64; garbage simply fails the checks below.
  const decoded = Buffer.from(body, 'base64').toString('utf8')
  if (!decoded.endsWith('$')) return false
  const host = decoded.slice(0, -1)
  return /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host)
}
const invalid = [...matches].filter((m) => !isValidPublishableKey(m))
if (invalid.length > 0) {
  console.error(`check-clerk-key: FAIL rule 3: ${invalid.length} key string(s) do not decode to "<frontend-api-host>$"`)
  process.exit(1)
}
console.log(`check-clerk-key: OK (${matches.size} key string(s) found)`)