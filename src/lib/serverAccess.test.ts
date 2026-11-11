import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetServerAccessForTests,
  canCallServer,
  getAuthStatus,
  initServerAccess,
  setAuthStatus,
  subscribeAuthStatus,
  whenAuthSettled,
} from './serverAccess'

describe('serverAccess', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetServerAccessForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    _resetServerAccessForTests()
  })

  it('dev build (no key): allowed, no timer armed', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
    initServerAccess()
    expect(getAuthStatus()).toBe('dev')
    expect(canCallServer()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('key set: starts pending/denied and arms no timer on import or read', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    expect(getAuthStatus()).toBe('pending')
    expect(canCallServer()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pending becomes anonymous after 8s; init is idempotent', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    initServerAccess()
    initServerAccess()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(7_999)
    expect(getAuthStatus()).toBe('pending')
    vi.advanceTimersByTime(1)
    expect(getAuthStatus()).toBe('anonymous')
    expect(canCallServer()).toBe(false)
  })

  it('setAuthStatus before 8s clears the timer; late load still corrects', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    initServerAccess()
    setAuthStatus('signed-in')
    expect(vi.getTimerCount()).toBe(0)
    expect(canCallServer()).toBe(true)
    vi.advanceTimersByTime(20_000)
    expect(getAuthStatus()).toBe('signed-in')
    setAuthStatus('anonymous')
    expect(canCallServer()).toBe(false)
  })

  it('notifies subscribers until unsubscribed', () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    const fn = vi.fn()
    const off = subscribeAuthStatus(fn)
    setAuthStatus('anonymous')
    expect(fn).toHaveBeenCalledWith('anonymous')
    off()
    setAuthStatus('signed-in')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('whenAuthSettled resolves on settle and on timeout', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    const settled = whenAuthSettled(3000)
    setAuthStatus('signed-in')
    await expect(settled).resolves.toBe('signed-in')

    _resetServerAccessForTests()
    const timedOut = whenAuthSettled(3000)
    vi.advanceTimersByTime(3000)
    await expect(timedOut).resolves.toBe('pending')
  })

  it('whenAuthSettled returns immediately when already settled', async () => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
    setAuthStatus('anonymous')
    await expect(whenAuthSettled()).resolves.toBe('anonymous')
  })
})
