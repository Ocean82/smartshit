import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The contract that matters in every environment without a DSN (local dev, CI,
 * self-hosted): the module is completely inert. A test that initialised Sentry
 * with a real-looking DSN would attempt network I/O, so the enabled path is
 * covered implicitly by the boot diagnostics and the type checker.
 */
describe('server errorReporting without SENTRY_DSN', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('initErrorReporting returns false and stays disabled', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.resetModules()
    const mod = await import('../src/errorReporting.js')

    expect(mod.initErrorReporting()).toBe(false)
    expect(mod.isErrorReportingEnabled()).toBe(false)
  })

  it('initErrorReporting is idempotent', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.resetModules()
    const mod = await import('../src/errorReporting.js')

    expect(mod.initErrorReporting()).toBe(false)
    // A DSN that appears later (hot reload, test leakage) must not turn on
    // reporting after startup decided not to.
    vi.stubEnv('SENTRY_DSN', 'https://public@example.invalid/1')
    expect(mod.initErrorReporting()).toBe(false)
  })

  it('captureError and flushErrorReporting are no-ops', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.resetModules()
    const mod = await import('../src/errorReporting.js')
    mod.initErrorReporting()

    expect(() => mod.captureError(new Error('boom'), { errorId: 'abc' })).not.toThrow()
    await expect(mod.flushErrorReporting(10)).resolves.toBe(true)
  })

  it('treats a whitespace-only DSN as unset', async () => {
    vi.stubEnv('SENTRY_DSN', '   ')
    vi.resetModules()
    const mod = await import('../src/errorReporting.js')

    expect(mod.initErrorReporting()).toBe(false)
  })
})
