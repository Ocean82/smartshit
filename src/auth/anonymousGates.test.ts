/**
 * Anonymous-mode gates on the auth-adjacent transports: checkout, auto-fix
 * reservation and the plan check. No jsdom, so DOM edges are plain stubs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openSignIn = vi.fn(async () => 'open-dialog')
vi.mock('./SignInDialog', () => ({ openSignIn: (...a: unknown[]) => openSignIn(...(a as [])) }))

import { startCheckout } from './startCheckout'
import { requestAutoFixReservation } from './useAutoFixGate'
import {
  __resetSubscriptionStatusForTests,
  requestPlanStatus,
  startSessionCheck,
} from './useSubscriptionStatus'
import { FREE_AUTOFIX_LIFETIME_LIMIT, AUTOFIX_USAGE_KEY } from '@/lib/featureGates'
import { _resetServerAccessForTests, setAuthStatus } from '@/lib/serverAccess'

const neverToken = vi.fn(() => new Promise<string | null>(() => {}))
const store = new Map<string, string>()

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
  _resetServerAccessForTests()
  store.clear()
  neverToken.mockClear()
  openSignIn.mockClear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  _resetServerAccessForTests()
  __resetSubscriptionStatusForTests()
})

describe('startCheckout (T5)', () => {
  it('anonymous: no fetch, opens sign-in for upgrade', async () => {
    setAuthStatus('anonymous')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(startCheckout()).resolves.toBe('failed')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openSignIn).toHaveBeenCalledWith('upgrade')
  })
})

describe('requestAutoFixReservation (T6)', () => {
  it('anonymous with a never-settling getToken: local decision, getToken untouched, no fetch', async () => {
    setAuthStatus('anonymous')
    const fetchImpl = vi.fn()
    for (let i = 0; i < FREE_AUTOFIX_LIFETIME_LIMIT; i++) {
      const d = await requestAutoFixReservation(false, neverToken, fetchImpl as never)
      expect(d.allowed).toBe(true)
    }
    const denied = await requestAutoFixReservation(false, neverToken, fetchImpl as never)
    expect(denied).toEqual({ allowed: false, used: FREE_AUTOFIX_LIFETIME_LIMIT, limit: FREE_AUTOFIX_LIFETIME_LIMIT })
    expect(neverToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('pending that never settles: local decision after the 3 s wait', async () => {
    const fetchImpl = vi.fn()
    const p = requestAutoFixReservation(false, neverToken, fetchImpl as never)
    await vi.advanceTimersByTimeAsync(3100)
    await expect(p).resolves.toMatchObject({ allowed: true })
    expect(neverToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(store.get(AUTOFIX_USAGE_KEY)).toBe('1')
  })

  it('pending then signed-in: reserves on the server and leaves the local counter alone', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ allowed: true, used: 1, limit: 3 }) }))
    const p = requestAutoFixReservation(false, async () => 'tok', fetchImpl as never, 'https://api.test')
    setAuthStatus('signed-in')
    await expect(p).resolves.toEqual({ allowed: true, used: 1, limit: 3 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('signed-in with a null token: local decision, no fetch', async () => {
    setAuthStatus('signed-in')
    const fetchImpl = vi.fn()
    const d = await requestAutoFixReservation(false, async () => null, fetchImpl as never)
    expect(d.allowed).toBe(true)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('plan check (T7)', () => {
  it('anonymous: ok:false without touching getToken or fetch', async () => {
    setAuthStatus('anonymous')
    const fetchImpl = vi.fn()
    await expect(requestPlanStatus(neverToken, fetchImpl as never)).resolves.toEqual({ ok: false })
    expect(neverToken).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('pending that settles signed-in makes the request', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ isPro: true }) }))
    const p = requestPlanStatus(async () => 'tok', fetchImpl as never, 'https://api.test')
    setAuthStatus('signed-in')
    await expect(p).resolves.toEqual({ ok: true, data: { isPro: true } })
  })

  it('pending that never settles: ok:false after 3 s, no getToken call', async () => {
    const p = requestPlanStatus(neverToken, vi.fn() as never)
    await vi.advanceTimersByTimeAsync(3100)
    await expect(p).resolves.toEqual({ ok: false })
    expect(neverToken).not.toHaveBeenCalled()
  })

  it('a failed first check does not latch the session; a successful one does', async () => {
    setAuthStatus('signed-in')
    const failing = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    startSessionCheck('sess-1', async () => 'tok', failing as never)
    await vi.advanceTimersByTimeAsync(10)
    startSessionCheck('sess-1', async () => 'tok', failing as never)
    await vi.advanceTimersByTimeAsync(10)
    expect(failing).toHaveBeenCalledTimes(2)

    const free = vi.fn(async () => ({ ok: true, json: async () => ({ isPro: false }) }))
    startSessionCheck('sess-2', async () => 'tok', free as never)
    await vi.advanceTimersByTimeAsync(10)
    startSessionCheck('sess-2', async () => 'tok', free as never)
    await vi.advanceTimersByTimeAsync(10)
    expect(free).toHaveBeenCalledTimes(1)
  })
})