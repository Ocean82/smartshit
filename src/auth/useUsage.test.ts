/**
 * Usage reconciliation (F16).
 *
 * The local counter is an optimistic guess; the server returns the
 * authoritative count after a billable turn. These tests cover the pure,
 * non-hook parts: account-keyed storage isolation and server reconciliation.
 *
 * The unit tier runs in the `node` environment (no jsdom), so localStorage is
 * stubbed as an in-memory map — the same pattern as persistence.test.ts.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { syncServerUsage } from './useUsage'

const PREFIX = 'smartsht_usage'
const today = new Date().toISOString().slice(0, 10)
const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
})

afterEach(() => vi.unstubAllGlobals())

function stored(accountId: string | null): { count: number; date: string } | null {
  const key = accountId ? `${PREFIX}:${accountId}` : PREFIX
  const raw = store.get(key)
  return raw ? JSON.parse(raw) : null
}

describe('syncServerUsage', () => {
  it('writes the authoritative count under the account key', () => {
    syncServerUsage('user_abc', 4)
    expect(stored('user_abc')).toEqual({ count: 4, date: today })
  })

  it('isolates counts per account (no cross-account bleed)', () => {
    syncServerUsage('user_a', 5)
    syncServerUsage('user_b', 1)
    expect(stored('user_a')!.count).toBe(5)
    expect(stored('user_b')!.count).toBe(1)
    // The anonymous/legacy bucket is untouched by account-keyed writes.
    expect(stored(null)).toBeNull()
  })

  it('overwrites a drifted local count with the server truth', () => {
    syncServerUsage('user_abc', 9) // optimistic local count had drifted high
    syncServerUsage('user_abc', 3) // server says the real count is 3
    expect(stored('user_abc')!.count).toBe(3)
  })

  it('ignores a non-finite or negative count', () => {
    syncServerUsage('user_abc', Number.NaN)
    syncServerUsage('user_abc', -1)
    expect(stored('user_abc')).toBeNull()
  })
})
