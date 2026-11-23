import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadExpandedFolders, saveExpandedFolders } from './expandedFolders'

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('expanded folders', () => {
  it('starts empty and round-trips', () => {
    expect(loadExpandedFolders().size).toBe(0)
    saveExpandedFolders(new Set(['a', 'b']), ['a', 'b', 'c'])
    expect([...loadExpandedFolders()].sort()).toEqual(['a', 'b'])
  })

  it('drops folders that no longer exist when saving', () => {
    saveExpandedFolders(new Set(['a', 'gone']), ['a'])
    expect([...loadExpandedFolders()]).toEqual(['a'])
  })

  it('ignores malformed saved data', () => {
    localStorage.setItem('smartsht-expanded-folders', '{"x":1}')
    expect(loadExpandedFolders().size).toBe(0)
    localStorage.setItem('smartsht-expanded-folders', '["ok", 5, null]')
    expect([...loadExpandedFolders()]).toEqual(['ok'])
    localStorage.setItem('smartsht-expanded-folders', 'not json')
    expect(loadExpandedFolders().size).toBe(0)
  })
})
