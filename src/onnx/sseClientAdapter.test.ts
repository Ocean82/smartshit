import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sseRun = vi.fn(() => ({ promise: Promise.resolve({ ok: true }), handle: {} }))
vi.mock('./sseClient', () => ({ runServerInference: (...a: unknown[]) => sseRun(...(a as [])) }))

import { AnonymousServerError, runServerInference } from './sseClientAdapter'
import { _resetServerAccessForTests, setAuthStatus } from '@/lib/serverAccess'

const tensor = { data: [1], shape: [1], dtype: 'float32' } as never

describe('sseClientAdapter gate (T3b)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    _resetServerAccessForTests()
    sseRun.mockClear()
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    _resetServerAccessForTests()
  })

  it('anonymous: rejects with the sign-in error and never reaches the client or fetch', async () => {
    setAuthStatus('anonymous')
    await expect(runServerInference('m', tensor)).rejects.toBeInstanceOf(AnonymousServerError)
    expect(sseRun).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('signed-in: delegates to the SSE client', async () => {
    setAuthStatus('signed-in')
    await runServerInference('m', tensor)
    expect(sseRun).toHaveBeenCalledTimes(1)
  })
})