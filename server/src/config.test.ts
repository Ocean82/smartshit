/**
 * Config resolution tests — see docs/repo-assessment-2026-07-24.md (P0-2, P1-3).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

async function loadConfig() {
  // config.ts reads process.env at module load, so force a fresh evaluation
  vi.resetModules()
  const mod = await import('./config.js')
  return mod.config
}

beforeEach(() => {
  delete process.env.TRUST_PROXY
  delete process.env.CORS_ORIGIN
  delete process.env.APP_URL
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('trustProxy', () => {
  it('defaults to loopback so nginx-forwarded IPs are honoured safely', async () => {
    const config = await loadConfig()
    expect(config.trustProxy).toBe('loopback')
  })

  it('parses a hop count', async () => {
    process.env.TRUST_PROXY = '2'
    const config = await loadConfig()
    expect(config.trustProxy).toBe(2)
  })

  it('parses booleans', async () => {
    process.env.TRUST_PROXY = 'false'
    expect((await loadConfig()).trustProxy).toBe(false)
    process.env.TRUST_PROXY = 'true'
    expect((await loadConfig()).trustProxy).toBe(true)
  })

  it('passes through an address list', async () => {
    process.env.TRUST_PROXY = '10.0.0.1, 10.0.0.2'
    expect((await loadConfig()).trustProxy).toBe('10.0.0.1, 10.0.0.2')
  })
})

describe('corsOrigin', () => {
  it('does not default to a wildcard', async () => {
    const config = await loadConfig()
    expect(config.corsOrigin).not.toBe('*')
    expect(Array.isArray(config.corsOrigin)).toBe(true)
  })

  it('includes the app URL, its www variant, and local dev origins', async () => {
    process.env.APP_URL = 'https://smartsht.com'
    const origins = (await loadConfig()).corsOrigin as string[]
    expect(origins).toContain('https://smartsht.com')
    expect(origins).toContain('https://www.smartsht.com')
    expect(origins).toContain('http://localhost:5173')
  })

  it('honours an explicit wildcard opt-in', async () => {
    process.env.CORS_ORIGIN = '*'
    expect((await loadConfig()).corsOrigin).toBe('*')
  })

  it('parses a comma-separated allowlist', async () => {
    process.env.CORS_ORIGIN = 'https://a.example, https://b.example'
    expect((await loadConfig()).corsOrigin).toEqual(['https://a.example', 'https://b.example'])
  })
})
