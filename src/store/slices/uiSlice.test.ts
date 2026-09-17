import { beforeEach, describe, expect, it } from 'vitest'
import { createUIActions, createUIState } from './uiSlice'

function mockLocalStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: () => null,
    get length() { return map.size },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  return storage
}

describe('view prefs localStorage', () => {
  beforeEach(() => {
    mockLocalStorage().clear()
  })

  it('defaults view flags to on when unset', () => {
    const s = createUIState()
    expect(s.showFormulaBar).toBe(true)
    expect(s.showSheetTabs).toBe(true)
    expect(s.showGridlines).toBe(true)
  })

  it('restores toggled prefs from localStorage', () => {
    let state = createUIState()
    const get = () => state
    const set = (fn: (s: typeof state) => void) => { fn(state) }
    const actions = createUIActions(set, get)

    actions.toggleFormulaBar()
    actions.toggleSheetTabs()
    actions.toggleGridlines()

    expect(localStorage.getItem('smartsht-show-formula-bar')).toBe('0')
    expect(localStorage.getItem('smartsht-show-sheet-tabs')).toBe('0')
    expect(localStorage.getItem('smartsht-show-gridlines')).toBe('0')

    state = createUIState()
    expect(state.showFormulaBar).toBe(false)
    expect(state.showSheetTabs).toBe(false)
    expect(state.showGridlines).toBe(false)
  })
})
