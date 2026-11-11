/** cloudSync must make zero requests unless the shared auth status allows it (T4, T4b, T4c). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelPendingSaves,
  createInCloud,
  deleteFromCloud,
  flushSave,
  isCloudConfigured,
  listCloudWorkbooks,
  listVersions,
  loadFromCloud,
  loadVersion,
  saveToCloud,
  scheduleSave,
  setAuthTokenProvider,
  setUserId,
} from './cloudSync'
import { _resetServerAccessForTests, setAuthStatus } from './serverAccess'
import type { WorkbookData } from '@/types'

const wb = { id: 'wb', name: 'wb', sheets: [], activeSheetId: 's', createdAt: 0, updatedAt: 0 } as unknown as WorkbookData
const store = new Map<string, string>()
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x')
  _resetServerAccessForTests()
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  fetchSpy = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ saved: true, version: 1, sizeBytes: 1 }) }))
  vi.stubGlobal('fetch', fetchSpy)
  setUserId('stale-user') // a stale id from a previous session
  setAuthTokenProvider(async () => 'tok')
})
afterEach(() => {
  cancelPendingSaves()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  _resetServerAccessForTests()
})

describe('cloudSync anonymous gate (T4)', () => {
  it('with a stale user id and status anonymous, nothing is configured and nothing is fetched', async () => {
    setAuthStatus('anonymous')
    expect(isCloudConfigured()).toBe(false)
    await listCloudWorkbooks()
    await createInCloud(wb)
    await loadFromCloud('c1')
    await saveToCloud('c1', wb)
    await deleteFromCloud('c1')
    await listVersions('c1')
    await loadVersion('c1', 'v1')
    scheduleSave('c1', wb)
    flushSave('c1', wb)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('pending is treated as not allowed', async () => {
    expect(isCloudConfigured()).toBe(false)
    await listCloudWorkbooks()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('late sign-in re-schedules saves (T4b)', () => {
  it('pending: no timer and no request; after signed-in the next schedule saves', async () => {
    scheduleSave('c1', wb)
    expect(vi.getTimerCount()).toBe(0)
    setAuthStatus('signed-in')
    scheduleSave('c1', wb)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(6_000)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('cancelPendingSaves (T4c)', () => {
  it('drops queued saves and nothing is sent after the flip to anonymous', async () => {
    setAuthStatus('signed-in')
    scheduleSave('c1', wb)
    expect(vi.getTimerCount()).toBe(1)
    cancelPendingSaves()
    setAuthStatus('anonymous')
    await vi.advanceTimersByTimeAsync(10_000)
    flushSave('c1', wb)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})