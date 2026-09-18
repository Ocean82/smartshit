/**
 * Async persistence tests: IndexedDB-primary save/load with localStorage as the
 * synchronous boot mirror + fallback.
 *
 * The node test env has no real IndexedDB, so we mock @/lib/idbStorage with an
 * in-memory map. That lets us exercise the IDB-primary path, the localStorage
 * mirror, and the staleness/source reconciliation that boot hydration relies on.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WorkbookData, FileItem } from '@/types'

// In-memory stand-in for IndexedDB. Reset per test.
const idbMap = new Map<string, unknown>()
let idbBroken = false // simulate IDB unavailable/failing

vi.mock('@/lib/idbStorage', () => ({
  idbGet: async (key: string) => (idbBroken ? null : (idbMap.get(key) ?? null)),
  idbSet: async (key: string, value: unknown) => {
    if (idbBroken) return false
    idbMap.set(key, value)
    return true
  },
  idbDel: async (key: string) => {
    idbMap.delete(key)
    return true
  },
}))

import {
  loadPersistedState,
  loadPersistedStateAsync,
  savePersistedStateAsync,
  type PersistedState,
} from './persistence'

const STORAGE_KEY = 'smartsht-state-v1'

function makeWorkbook(id: string, name: string): WorkbookData {
  return {
    id, name,
    sheets: [{ id: `s-${id}`, name: 'Sheet1', cells: { A1: { value: 'hi' } }, columnWidths: {}, rowHeights: {} }],
    activeSheetId: `s-${id}`, createdAt: 1, updatedAt: 1,
  }
}
function makeFile(id: string, workbookId: string): FileItem {
  return { id, name: id, type: 'file', parentId: null, workbookId, createdAt: 1, updatedAt: 1 }
}
function makeState(wbId = 'wb1'): PersistedState {
  return {
    workbooks: { [wbId]: makeWorkbook(wbId, 'A') },
    files: [makeFile('f1', wbId)],
    activeFileId: 'f1',
    activeWorkbookId: wbId,
    messages: [],
  }
}

const store = new Map<string, string>()
let localBroken = false

beforeEach(() => {
  idbMap.clear()
  store.clear()
  idbBroken = false
  localBroken = false
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (localBroken) throw new DOMException('full', 'QuotaExceededError')
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('savePersistedStateAsync', () => {
  it('writes both the IDB primary and the localStorage mirror', async () => {
    const res = await savePersistedStateAsync(makeState())
    expect(res.ok).toBe(true)
    // IDB envelope present with a timestamp.
    expect(idbMap.has('state-v1')).toBe(true)
    // localStorage mirror present (used for the next sync boot seed).
    expect(store.has(STORAGE_KEY)).toBe(true)
  })

  it('still succeeds when localStorage is full but IDB accepts the write', async () => {
    localBroken = true // large workbook overflows the ~5MB localStorage cap
    const res = await savePersistedStateAsync(makeState())
    // IDB is the durable primary — a localStorage quota failure is not fatal.
    expect(res.ok).toBe(true)
    expect(idbMap.has('state-v1')).toBe(true)
  })

  it('reports failure only when BOTH layers fail', async () => {
    idbBroken = true
    localBroken = true
    const res = await savePersistedStateAsync(makeState())
    expect(res.ok).toBe(false)
    expect(res).toMatchObject({ reason: 'quota' })
  })
})

describe('loadPersistedStateAsync', () => {
  it('prefers the IDB primary and reports source=idb', async () => {
    await savePersistedStateAsync(makeState('wbIDB'))
    const loaded = await loadPersistedStateAsync()
    expect(loaded?.source).toBe('idb')
    expect(Object.keys(loaded!.workbooks)).toEqual(['wbIDB'])
    expect(loaded!.savedAt).toBeGreaterThan(0)
  })

  it('falls back to localStorage when IDB is empty (migration from pre-IDB)', async () => {
    // Only localStorage has data (as if written by an older app version).
    store.set(STORAGE_KEY, JSON.stringify({ ...makeState('wbLocal'), savedAt: 123 }))
    const loaded = await loadPersistedStateAsync()
    expect(loaded?.source).toBe('localStorage')
    expect(Object.keys(loaded!.workbooks)).toEqual(['wbLocal'])
    expect(loaded!.savedAt).toBe(123)
  })

  it('returns null when neither layer has usable state', async () => {
    expect(await loadPersistedStateAsync()).toBeNull()
  })

  it('sync loadPersistedState still reads the localStorage mirror after an async save', async () => {
    await savePersistedStateAsync(makeState('wbSync'))
    // The mirror keeps the synchronous boot seed working.
    const sync = loadPersistedState()
    expect(sync).not.toBeNull()
    expect(Object.keys(sync!.workbooks)).toEqual(['wbSync'])
  })
})
