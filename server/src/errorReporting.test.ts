import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `@sentry/node` is mocked: importing the real SDK cold (inside a dynamic
 * import, alongside 50 other test files) is slow enough to blow the default
 * timeout under load, and none of its network behaviour belongs in a unit test.
 * Mocking also lets us assert the enabled path, which a DSN-less test cannot.
 */
const sentry = vi.hoisted(() => {
  const setContext = vi.fn()
  return {
    init: vi.fn(),
    captureException: vi.fn(),
    withScope: vi.fn((cb: (scope: { setContext: typeof setContext }) => void) => {
      cb({ setContext })
    }),
    flush: vi.fn(async () => true),
    setContext,
  }
})

vi.mock('@sentry/node', () => sentry)

/** Fresh module instance so the singleton state (initialized/enabled) resets. */
function loadModule() {
  vi.resetModules()
  return import('../src/errorReporting.js')
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  sentry.flush.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('server errorReporting without SENTRY_DSN', () => {
  it('stays disabled and never initialises Sentry', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const mod = await loadModule()

    expect(mod.initErrorReporting()).toBe(false)
    expect(mod.isErrorReportingEnabled()).toBe(false)
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('treats a whitespace-only DSN as unset', async () => {
    vi.stubEnv('SENTRY_DSN', '   ')
    const mod = await loadModule()

    expect(mod.initErrorReporting()).toBe(false)
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('captureError stays inert and flush reports nothing to do', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const mod = await loadModule()
    mod.initErrorReporting()

    expect(() => mod.captureError(new Error('boom'), { errorId: 'abc' })).not.toThrow()
    expect(sentry.captureException).not.toHaveBeenCalled()
    await expect(mod.flushErrorReporting(10)).resolves.toBe(true)
    expect(sentry.flush).not.toHaveBeenCalled()
  })
})

describe('server errorReporting with a DSN', () => {
  const DSN = 'https://public@example.invalid/1'

  function stubConfig() {
    vi.stubEnv('SENTRY_DSN', DSN)
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('SENTRY_RELEASE', 'smartsht@test')
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.25')
  }

  it('initialises Sentry with the configured values', async () => {
    stubConfig()
    const mod = await loadModule()

    expect(mod.initErrorReporting()).toBe(true)
    expect(mod.isErrorReportingEnabled()).toBe(true)
    expect(sentry.init).toHaveBeenCalledTimes(1)
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'staging',
        release: 'smartsht@test',
        tracesSampleRate: 0.25,
      }),
    )
  })

  it('falls back to 0 traces when the rate is missing or invalid', async () => {
    vi.stubEnv('SENTRY_DSN', DSN)
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', 'not-a-number')
    const mod = await loadModule()

    mod.initErrorReporting()
    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: DSN, environment: 'staging', release: undefined, tracesSampleRate: 0 }),
    )
  })

  it('drops Sentry\'s own crash handlers so index.ts is the only reporter', async () => {
    stubConfig()
    const mod = await loadModule()
    mod.initErrorReporting()
    const { integrations } = sentry.init.mock.calls[0][0] as {
      integrations: (d: { name: string }[]) => { name: string }[]
    }
    const kept = integrations([
      { name: 'OnUncaughtException' },
      { name: 'OnUnhandledRejection' },
      { name: 'Console' },
    ])
    expect(kept.map((i) => i.name)).toEqual(['Console'])
  })

  it('is idempotent: a later DSN cannot turn reporting on after startup', async () => {
    vi.stubEnv('SENTRY_DSN', '')
    const mod = await loadModule()
    expect(mod.initErrorReporting()).toBe(false)

    vi.stubEnv('SENTRY_DSN', DSN)
    expect(mod.initErrorReporting()).toBe(false)
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('reports an error with its context and correlation id', async () => {
    stubConfig()
    const mod = await loadModule()
    mod.initErrorReporting()

    const err = new Error('db down')
    mod.captureError(err, { errorId: 'abc12345', context: 'workbooks.create' })

    expect(sentry.withScope).toHaveBeenCalledTimes(1)
    expect(sentry.setContext).toHaveBeenCalledWith('smartsht', {
      errorId: 'abc12345',
      context: 'workbooks.create',
    })
    expect(sentry.captureException).toHaveBeenCalledWith(err)
  })

  it('reports without a context block', async () => {
    stubConfig()
    const mod = await loadModule()
    mod.initErrorReporting()

    mod.captureError('plain string rejection')

    expect(sentry.setContext).not.toHaveBeenCalled()
    expect(sentry.captureException).toHaveBeenCalledWith('plain string rejection')
  })

  it('flushes queued events and surfaces a timeout as false', async () => {
    stubConfig()
    const mod = await loadModule()
    mod.initErrorReporting()

    await expect(mod.flushErrorReporting(1500)).resolves.toBe(true)
    expect(sentry.flush).toHaveBeenCalledWith(1500)

    sentry.flush.mockRejectedValueOnce(new Error('network'))
    await expect(mod.flushErrorReporting(10)).resolves.toBe(false)
  })
})

describe('secret redaction', () => {
  it('masks API keys, bearer tokens and key= query params', async () => {
    const { redactSecrets } = await loadModule()
    expect(redactSecrets('Incorrect API key provided: sk-proj-abcdef1234567890')).toBe(
      'Incorrect API key provided: [redacted]',
    )
    expect(redactSecrets('401 gsk_AbCdEfGhIjKlMnOp rejected')).toBe('401 [redacted] rejected')
    expect(redactSecrets('Authorization: Bearer abc.def-ghi_jkl123')).toBe('Authorization: [redacted]')
    expect(redactSecrets('GET /v1?key=SECRET123&alt=json')).toBe('GET /v1?key=[redacted]&alt=json')
  })

  it('leaves ordinary messages alone', async () => {
    const { redactSecrets } = await loadModule()
    expect(redactSecrets('connect ECONNREFUSED 127.0.0.1:5432')).toBe('connect ECONNREFUSED 127.0.0.1:5432')
    expect(redactSecrets('task-runner timed out')).toBe('task-runner timed out')
  })

  it('scrubs exception values and messages on the event', async () => {
    const { scrubEvent } = await loadModule()
    const event = scrubEvent({
      type: undefined,
      message: 'failed with sk-live-0123456789abcdef',
      exception: { values: [{ value: 'Bearer abcdefgh12345678' }, {}] },
    })
    expect(event.message).toBe('failed with [redacted]')
    expect(event.exception?.values?.[0].value).toBe('[redacted]')
  })
})
