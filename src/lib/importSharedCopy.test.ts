import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importSharedCopy } from './importSharedCopy'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

const KEY = 'smartsht-import-shared'
let store: Map<string, string>

beforeEach(() => {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => void store.delete(k),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('importSharedCopy', () => {
  it('opens the saved copy as a new file under its name, then clears it', () => {
    const wb = createEmptyWorkbook('Team budget')
    store.set(KEY, JSON.stringify(wb))
    const importer = vi.fn()
    importSharedCopy(importer)
    expect(importer).toHaveBeenCalledTimes(1)
    expect(importer.mock.calls[0][0].id).toBe(wb.id)
    expect(importer.mock.calls[0][1]).toEqual({ fileName: 'Team budget', asNewFile: true })
    expect(store.has(KEY)).toBe(false)
  })

  it('does nothing when there is no saved copy', () => {
    const importer = vi.fn()
    importSharedCopy(importer)
    expect(importer).not.toHaveBeenCalled()
  })

  it('drops an unreadable saved copy instead of retrying it on every start', () => {
    store.set(KEY, '{not json')
    const importer = vi.fn()
    importSharedCopy(importer)
    expect(importer).not.toHaveBeenCalled()
    expect(store.has(KEY)).toBe(false)
  })

  it('still clears the saved copy if opening it fails', () => {
    store.set(KEY, JSON.stringify(createEmptyWorkbook('x')))
    importSharedCopy(() => { throw new Error('boom') })
    expect(store.has(KEY)).toBe(false)
  })
})