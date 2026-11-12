import { describe, expect, it, vi } from 'vitest'
import { applyAuthTransition, type AuthTransitionDeps } from './applyAuthTransition'
import { decideCloudUnbind } from './accountSwitch'
import { CLEAR_DEVICE_LABEL } from './anonCopy'

function makeDeps(opts: { lastUser?: string | null; flag?: boolean; confirm?: boolean } = {}) {
  const calls: string[] = []
  let flag = opts.flag ?? false
  const toast = vi.fn()
  const clearDeviceData = vi.fn()
  const dismissSignedOutToast = vi.fn()
  let status: 'pending' | 'anonymous' | 'signed-in' = 'anonymous'
  const deps: AuthTransitionDeps = {
    setAuthTokenProvider: (p) => calls.push(p ? 'provider' : 'provider:null'),
    setUserId: (id) => calls.push(`userId:${id}`),
    cancelPendingSaves: () => calls.push('cancelSaves'),
    clearCloudBindings: () => calls.push('unbind'),
    clearCache: () => calls.push('clearCache'),
    setAuthStatus: (s) => calls.push(`status:${s}`),
    toast,
    getLastCloudUser: () => opts.lastUser ?? null,
    setLastCloudUser: (id) => calls.push(`last:${id}`),
    getSignoutToastShown: () => flag,
    setSignoutToastShown: () => {
      flag = true
    },
    clearDeviceData,
    confirm: () => opts.confirm ?? true,
    getAuthStatus: () => status,
    dismissSignedOutToast,
  }
  return {
    deps,
    calls,
    toast,
    clearDeviceData,
    dismissSignedOutToast,
    setStatus: (s: typeof status) => {
      status = s
    },
    isFlagSet: () => flag,
  }
}

const signedIn = (previousStatus: 'pending' | 'anonymous' | 'signed-in', previousUserId: string | null = null) => ({
  isSignedIn: true,
  userId: 'u1',
  getToken: async () => 't',
  previousStatus,
  previousUserId,
})
const signedOut = (previousStatus: 'pending' | 'anonymous' | 'signed-in') => ({
  isSignedIn: false,
  userId: null,
  getToken: async () => null,
  previousStatus,
  previousUserId: null,
})

describe('applyAuthTransition order (T1b)', () => {
  it('signed-in: provider, userId, unbind check, last user, clearCache, status last', () => {
    const { deps, calls } = makeDeps({ lastUser: 'other' })
    applyAuthTransition(deps, signedIn('pending'))
    expect(calls).toEqual(['provider', 'userId:u1', 'unbind', 'last:u1', 'clearCache', 'status:signed-in'])
  })

  it('signed-out: provider null, userId null, cancelSaves, status last', () => {
    const { deps, calls } = makeDeps()
    applyAuthTransition(deps, signedOut('pending'))
    expect(calls).toEqual(['provider:null', 'userId:null', 'cancelSaves', 'status:anonymous'])
  })
})

describe('getToken-identity re-run (T1b2)', () => {
  it('does not clearCache/unbind when already signed-in as the same user, still refreshes provider', () => {
    const { deps, calls } = makeDeps({ lastUser: 'other' })
    applyAuthTransition(deps, signedIn('signed-in', 'u1'))
    expect(calls).toEqual(['provider', 'userId:u1', 'status:signed-in'])
  })
  it('runs them when the user id changes while signed in', () => {
    const { deps, calls } = makeDeps({ lastUser: 'old' })
    applyAuthTransition(deps, signedIn('signed-in', 'u0'))
    expect(calls).toContain('unbind')
    expect(calls).toContain('clearCache')
  })
})

describe('sign-out notice (T1c)', () => {
  it('(a) first anonymous settle with a remembered user: exactly one toast, flag set', () => {
    const { deps, toast, isFlagSet } = makeDeps({ lastUser: 'u1' })
    applyAuthTransition(deps, signedOut('pending'))
    expect(toast).toHaveBeenCalledTimes(1)
    const t = toast.mock.calls[0][0]
    expect(t.action.label).toBe(CLEAR_DEVICE_LABEL)
    expect(t.duration).toBe(Infinity)
    expect(isFlagSet()).toBe(true)
  })
  it('(b) flag already set: no toast', () => {
    const { deps, toast } = makeDeps({ lastUser: 'u1', flag: true })
    applyAuthTransition(deps, signedOut('pending'))
    expect(toast).not.toHaveBeenCalled()
  })
  it('(c) browser that never signed in: no toast', () => {
    const { deps, toast } = makeDeps({ lastUser: null })
    applyAuthTransition(deps, signedOut('pending'))
    expect(toast).not.toHaveBeenCalled()
  })
  it('(d) in-page signed-in to anonymous: one toast, and clear is not run by the transition itself', () => {
    const { deps, toast, clearDeviceData } = makeDeps({ lastUser: 'u1', flag: true })
    applyAuthTransition(deps, signedOut('signed-in'))
    expect(toast).toHaveBeenCalledTimes(1)
    expect(clearDeviceData).not.toHaveBeenCalled()
    toast.mock.calls[0][0].action.onClick()
    expect(clearDeviceData).toHaveBeenCalledTimes(1)
  })
  it('a sign-in dismisses the notice and makes a stale clear button inert', () => {
    const { deps, toast, clearDeviceData, dismissSignedOutToast, setStatus } = makeDeps({ lastUser: 'u1' })
    applyAuthTransition(deps, signedOut('pending'))
    const stale = toast.mock.calls[0][0].action.onClick
    applyAuthTransition(deps, signedIn('anonymous'))
    expect(dismissSignedOutToast).toHaveBeenCalledTimes(1)
    setStatus('signed-in')
    stale()
    expect(clearDeviceData).not.toHaveBeenCalled()
  })
  it('declined confirmation does not clear', () => {
    const { deps, toast, clearDeviceData } = makeDeps({ lastUser: 'u1', confirm: false })
    applyAuthTransition(deps, signedOut('pending'))
    toast.mock.calls[0][0].action.onClick()
    expect(clearDeviceData).not.toHaveBeenCalled()
  })
})

describe('decideCloudUnbind', () => {
  it('absent keeps, equal keeps, different unbinds', () => {
    expect(decideCloudUnbind(null, 'a')).toBe('keep')
    expect(decideCloudUnbind('a', 'a')).toBe('keep')
    expect(decideCloudUnbind('a', 'b')).toBe('unbind')
  })
})
