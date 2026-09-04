import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadPersistedState, savePersistedState, type PersistedState } from './persistence'
import type { WorkbookData, FileItem, ChatMessage } from '@/types'

const STORAGE_KEY = 'smartsht-state-v1'

function makeWorkbook(id: string, name: string): WorkbookData {
  return {
    id,
    name,
    sheets: [
      {
        id: `s-${id}`,
        name: 'Sheet1',
        cells: { A1: { value: 'hi' } },
        columnWidths: {},
        rowHeights: {},
      },
    ],
    activeSheetId: `s-${id}`,
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeFile(id: string, workbookId: string): FileItem {
  return { id, name: id, type: 'file', parentId: null, workbookId, createdAt: 1, updatedAt: 1 }
}

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('persistence', () => {
  it('round-trips the multi-workbook shape', () => {
    const messages: ChatMessage[] = [{ id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 }]
    const state: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A'), wb2: makeWorkbook('wb2', 'B') },
      files: [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')],
      activeFileId: 'f2',
      activeWorkbookId: 'wb2',
      messages,
    }

    savePersistedState(state)
    const loaded = loadPersistedState()

    expect(loaded).not.toBeNull()
    expect(Object.keys(loaded!.workbooks).sort()).toEqual(['wb1', 'wb2'])
    expect(loaded!.activeFileId).toBe('f2')
    expect(loaded!.activeWorkbookId).toBe('wb2')
    expect(loaded!.messages).toEqual(messages)
    expect(loaded!.workbooks.wb2.sheets[0].cells.A1.value).toBe('hi')
  })

  it('migrates the legacy single-workbook shape', () => {
    const legacy = {
      workbook: makeWorkbook('legacy-wb', 'Legacy'),
      files: [makeFile('f1', 'legacy-wb')],
      activeFileId: 'f1',
      messages: [],
    }
    store.set(STORAGE_KEY, JSON.stringify(legacy))

    const loaded = loadPersistedState()

    expect(loaded).not.toBeNull()
    expect(Object.keys(loaded!.workbooks)).toEqual(['legacy-wb'])
    expect(loaded!.workbooks['legacy-wb'].name).toBe('Legacy')
    expect(loaded!.activeFileId).toBe('f1')
  })

  it('falls back to the first file when activeFileId is stale', () => {
    const state: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A'), wb2: makeWorkbook('wb2', 'B') },
      files: [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')],
      activeFileId: 'deleted-file',
      activeWorkbookId: 'wb2',
      messages: [],
    }
    store.set(STORAGE_KEY, JSON.stringify(state))

    const loaded = loadPersistedState()
    expect(loaded!.activeFileId).toBe('f1')
  })

  it('returns null for missing or invalid state', () => {
    expect(loadPersistedState()).toBeNull()
    store.set(STORAGE_KEY, JSON.stringify({ garbage: true }))
    expect(loadPersistedState()).toBeNull()
  })

  it('reports ok on a successful save', () => {
    const state: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A') },
      files: [makeFile('f1', 'wb1')],
      activeFileId: 'f1',
      activeWorkbookId: 'wb1',
      messages: [],
    }
    expect(savePersistedState(state)).toEqual({ ok: true })
  })

  it('reports a quota failure instead of silently no-oping', () => {
    const quota = new DOMException('full', 'QuotaExceededError')
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => { throw quota },
      removeItem: (k: string) => void store.delete(k),
    })
    const state: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A') },
      files: [makeFile('f1', 'wb1')],
      activeFileId: 'f1',
      activeWorkbookId: 'wb1',
      messages: [],
    }
    const result = savePersistedState(state)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ reason: 'quota' })
  })

  it('reports a generic error for a non-quota setItem failure', () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => { throw new Error('nope') },
      removeItem: (k: string) => void store.delete(k),
    })
    const state: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A') },
      files: [makeFile('f1', 'wb1')],
      activeFileId: 'f1',
      activeWorkbookId: 'wb1',
      messages: [],
    }
    expect(savePersistedState(state)).toMatchObject({ ok: false, reason: 'error' })
  })

  it('quarantines a corrupt payload before returning null on load', () => {
    store.set(STORAGE_KEY, '{ this is not valid json')

    expect(loadPersistedState()).toBeNull()

    const backup = store.get('smartsht-state-v1.corrupt')
    expect(backup).toBeTruthy()
    const parsed = JSON.parse(backup!)
    expect(parsed.raw).toBe('{ this is not valid json')
    expect(typeof parsed.savedAt).toBe('string')
  })
})