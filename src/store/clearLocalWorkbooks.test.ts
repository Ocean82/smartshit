/** Account-switch unbinding (T9) and the explicit "Clear this device's data" action (T11). */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
const idb = new Map<string, unknown>()
vi.mock('@/lib/idbStorage', () => ({
  idbGet: async (k: string) => idb.get(k) ?? null,
  idbSet: async (k: string, v: unknown) => {
    idb.set(k, v)
    return true
  },
  idbDel: async (k: string) => {
    idb.delete(k)
    return true
  },
}))

import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { savePersistedState, savePersistedStateAsync } from '@/lib/persistence'
import { saveUserApiKey, loadUserApiKey } from '@/lib/userApiKey'
import { AUTOFIX_USAGE_KEY } from '@/lib/featureGates'
import { buildPersistenceSnapshot } from '@/lib/fileWorkbooks'

beforeEach(() => {
  store.clear()
  idb.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

function seedContentWorkbook() {
  const wb = createEmptyWorkbook('Secret')
  wb.sheets[0].cells['A1'] = { value: 'TOP-SECRET-VALUE' }
  useStore.getState().loadWorkbookData(wb)
  useStore.setState((s) => {
    s.workbook = wb
    s.workbookSlots = { [wb.id]: wb }
    s.files = [
      { id: 'f1', name: 'Secret', type: 'file', parentId: null, workbookId: wb.id, cloudWorkbookId: 'cloud-1', createdAt: 0, updatedAt: 0 },
      { id: 'f2', name: 'Other', type: 'file', parentId: null, cloudWorkbookId: 'cloud-2', createdAt: 0, updatedAt: 0 },
    ]
    s.activeFileId = 'f1'
    s.messages = [{ id: 'm1', role: 'user', content: 'private question', timestamp: 1 }]
  })
  return wb
}

describe('clearCloudBindings (T9)', () => {
  it('removes every cloudWorkbookId and leaves sheets, cells and messages identical', () => {
    const wb = seedContentWorkbook()
    const before = JSON.stringify({ wb: useStore.getState().workbook, m: useStore.getState().messages })
    useStore.getState().clearCloudBindings()
    const s = useStore.getState()
    expect(s.files.every((f) => f.cloudWorkbookId === undefined)).toBe(true)
    expect(JSON.stringify({ wb: s.workbook, m: s.messages })).toBe(before)
    expect(s.workbook.id).toBe(wb.id)
  })
})

describe('clearLocalWorkbooks (T11)', () => {
  it('wipes workbooks, chat, ids and the BYOK key by name; keeps the auto-fix counter', async () => {
    const wb = seedContentWorkbook()
    const snap = buildPersistenceSnapshot({
      workbook: wb,
      workbookSlots: useStore.getState().workbookSlots,
      files: useStore.getState().files,
      activeFileId: 'f1',
      messages: useStore.getState().messages,
    })
    savePersistedState(snap)
    await savePersistedStateAsync(snap)
    saveUserApiKey({ provider: 'openai', apiKey: 'sk-secret' } as never)
    store.set('smartsht-user-id', 'user_1')
    store.set('smartsht-last-cloud-user', 'user_1')
    store.set(AUTOFIX_USAGE_KEY, '2')
    expect(loadUserApiKey()).not.toBeNull()
    expect(store.has('smartsht-user-api-key')).toBe(true)

    await useStore.getState().clearLocalWorkbooks()

    const s = useStore.getState()
    expect(s.files).toHaveLength(1)
    expect(JSON.stringify(s.workbook)).not.toContain('TOP-SECRET-VALUE')
    expect(s.messages.some((m) => m.content === 'private question')).toBe(false)
    expect(store.has('smartsht-user-api-key')).toBe(false)
    expect(loadUserApiKey()).toBeNull()
    expect(store.has('smartsht-user-id')).toBe(false)
    expect(store.has('smartsht-last-cloud-user')).toBe(false)
    expect(store.has('smartsht-state-v1')).toBe(false)
    expect(idb.has('state-v1')).toBe(false)
    expect(store.get(AUTOFIX_USAGE_KEY)).toBe('2')
  })
})