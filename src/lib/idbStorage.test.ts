/**
 * idbStorage graceful-degradation tests.
 *
 * The suite runs in the `node` vitest environment, which has no `indexedDB`
 * global — the same situation as SSR or a browser with storage disabled. The
 * wrapper MUST degrade to null/false rather than throw, so persistence can fall
 * back to localStorage. That degradation path is exactly what these tests pin.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { idbGet, idbSet, idbDel, _resetIdbForTests } from './idbStorage'

afterEach(() => {
  _resetIdbForTests()
})

describe('idbStorage without an IndexedDB implementation', () => {
  it('idbGet resolves to null instead of throwing', async () => {
    await expect(idbGet('anything')).resolves.toBeNull()
  })

  it('idbSet resolves to false so callers fall back to localStorage', async () => {
    await expect(idbSet('k', { a: 1 })).resolves.toBe(false)
  })

  it('idbDel resolves to false when IndexedDB is unavailable', async () => {
    await expect(idbDel('k')).resolves.toBe(false)
  })
})
