import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestAutoFixReservation } from './useAutoFixGate'
import { AUTOFIX_USAGE_KEY, FREE_AUTOFIX_LIFETIME_LIMIT, getAutoFixUsed } from '@/lib/featureGates'

const getToken = vi.fn(async () => 'tok' as string | null)
const store = new Map<string, string>()

function respond(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }))
}

describe('requestAutoFixReservation', () => {
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    getToken.mockResolvedValue('tok')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('asks the server and caches its authoritative count', async () => {
    const fetchMock = respond({ allowed: true, used: 2, limit: FREE_AUTOFIX_LIFETIME_LIMIT })
    const result = await requestAutoFixReservation(false, getToken, fetchMock, 'https://api.test')

    expect(fetchMock).toHaveBeenCalledWith('https://api.test/api/autofix/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    })
    expect(result).toEqual({ allowed: true, used: 2, limit: FREE_AUTOFIX_LIFETIME_LIMIT })
    expect(getAutoFixUsed()).toBe(2)
  })

  it('a server denial wins over a fresh local count (cleared storage)', async () => {
    const fetchMock = respond({ allowed: false, used: FREE_AUTOFIX_LIFETIME_LIMIT, limit: FREE_AUTOFIX_LIFETIME_LIMIT })
    const result = await requestAutoFixReservation(false, getToken, fetchMock, '')
    expect(result.allowed).toBe(false)
    expect(getAutoFixUsed()).toBe(FREE_AUTOFIX_LIFETIME_LIMIT)
  })

  it('a server denial wins over a client that thinks it is Pro (saved BYOK key)', async () => {
    const fetchMock = respond({ allowed: false, used: FREE_AUTOFIX_LIFETIME_LIMIT, limit: FREE_AUTOFIX_LIFETIME_LIMIT })
    expect((await requestAutoFixReservation(true, getToken, fetchMock, '')).allowed).toBe(false)
  })

  it('Pro from the server is unlimited and leaves the local count alone', async () => {
    localStorage.setItem(AUTOFIX_USAGE_KEY, '1')
    const fetchMock = respond({ allowed: true, used: null, limit: null })
    expect(await requestAutoFixReservation(false, getToken, fetchMock, '')).toEqual({ allowed: true, used: null, limit: null })
    expect(getAutoFixUsed()).toBe(1)
  })

  it.each([
    ['network error', vi.fn(async () => { throw new Error('offline') })],
    ['non-2xx', respond({ error: 'x' }, false)],
    ['malformed body', respond({ allowed: 'yes' })],
  ])('falls back to the local counter on %s', async (_label, fetchMock) => {
    const first = await requestAutoFixReservation(false, getToken, fetchMock, '')
    expect(first).toEqual({ allowed: true, used: 1, limit: FREE_AUTOFIX_LIFETIME_LIMIT })
    localStorage.setItem(AUTOFIX_USAGE_KEY, String(FREE_AUTOFIX_LIFETIME_LIMIT))
    expect((await requestAutoFixReservation(false, getToken, fetchMock, '')).allowed).toBe(false)
  })

  it('falls back to the local counter without a session token', async () => {
    getToken.mockResolvedValue(null)
    const fetchMock = respond({})
    expect((await requestAutoFixReservation(false, getToken, fetchMock, '')).used).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
