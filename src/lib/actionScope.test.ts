/**
 * Action scope binding.
 *
 * Regression coverage for the reproduced defect: a proposal previewed on sheet
 * A changed sheet B after a tab switch, because execution read the *current*
 * active sheet and selection instead of the ones that were reviewed.
 */

import { describe, expect, it } from 'vitest'
import {
  ACTION_SCOPE_EPOCH,
  captureActionScope,
  collectStaleActionIds,
  computeSheetSignature,
  isActionStale,
  validateActionScope,
  type ActionScope,
  type ScopeSource,
} from './actionScope'
import type { AgentAction, Selection } from '@/types'

function makeSource(overrides: Partial<ScopeSource> = {}): ScopeSource {
  return {
    workbook: {
      id: 'wb-1',
      sheets: [
        { id: 'sheet-a', cells: { A1: { value: 1 } } },
        { id: 'sheet-b', cells: {} },
      ],
    },
    activeSheetId: 'sheet-a',
    selection: null,
    workbookRevision: 4,
    ...overrides,
  }
}

function makeAction(scope?: ActionScope): AgentAction {
  return {
    id: 'action-1',
    tool: 'set_range',
    params: {},
    description: 'Set a range',
    status: 'pending',
    scope,
  }
}

const selectionA: Selection = { startRow: 1, startCol: 1, endRow: 2, endCol: 3 }

describe('captureActionScope', () => {
  it('captures workbook, sheet, revision, selection and epoch', () => {
    const scope = captureActionScope(makeSource({ selection: selectionA }))
    expect(scope.workbookId).toBe('wb-1')
    expect(scope.sheetId).toBe('sheet-a')
    expect(scope.revision).toBe(4)
    expect(scope.selection).toEqual(selectionA)
    expect(scope.epoch).toBe(ACTION_SCOPE_EPOCH)
    expect(scope.sheetSignature).toBe(computeSheetSignature({ cells: { A1: { value: 1 } } }))
  })

  it('copies the selection so later store mutation cannot rewrite history', () => {
    const source = makeSource({ selection: selectionA })
    const scope = captureActionScope(source)
    source.selection!.startRow = 99
    expect(scope.selection!.startRow).toBe(1)
  })
})

describe('computeSheetSignature', () => {
  it('is stable for equal content and order-independent', () => {
    const a = computeSheetSignature({ cells: { A1: { value: 1 }, B2: { value: 2 } } })
    const b = computeSheetSignature({ cells: { B2: { value: 2 }, A1: { value: 1 } } })
    expect(a).toBe(b)
  })

  it('changes when a value, formula or format changes', () => {
    const base = computeSheetSignature({ cells: { A1: { value: 1 } } })
    expect(computeSheetSignature({ cells: { A1: { value: 2 } } })).not.toBe(base)
    expect(computeSheetSignature({ cells: { A1: { value: 1, formula: '=1' } } })).not.toBe(base)
    expect(computeSheetSignature({ cells: { A1: { value: 1, format: { bold: true } } } })).not.toBe(base)
    expect(computeSheetSignature({ cells: { A1: { value: 1 }, B1: { value: 3 } } })).not.toBe(base)
  })
})

describe('validateActionScope', () => {
  const current = captureActionScope(makeSource({ selection: selectionA }))

  it('accepts a matching scope', () => {
    expect(validateActionScope(makeAction(current), current).ok).toBe(true)
  })

  it('accepts an unbound (legacy) action', () => {
    expect(validateActionScope(makeAction(undefined), current).ok).toBe(true)
  })

  it('rejects an action from another page load', () => {
    const stale: ActionScope = { ...current, epoch: 'some-other-epoch' }
    const check = validateActionScope(makeAction(stale), current)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/reloaded/i)
  })

  it('rejects an action bound to a different workbook', () => {
    const stale: ActionScope = { ...current, workbookId: 'wb-2' }
    const check = validateActionScope(makeAction(stale), current)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/workbook/i)
  })

  it('rejects an action bound to a different sheet (tab switch)', () => {
    const stale: ActionScope = { ...current, sheetId: 'sheet-b' }
    const check = validateActionScope(makeAction(stale), current)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/sheet/i)
  })

  it('rejects an action whose reviewed selection moved', () => {
    const stale: ActionScope = { ...current, selection: { startRow: 5, startCol: 5, endRow: 5, endCol: 5 } }
    const check = validateActionScope(makeAction(stale), current)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/selection/i)
  })

  it('rejects an action from an older workbook revision', () => {
    const stale: ActionScope = { ...current, revision: current.revision - 1 }
    const check = validateActionScope(makeAction(stale), current)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/sheet changed/i)
  })

  it('rejects an action whose reviewed sheet content changed', () => {
    const stale: ActionScope = { ...current, sheetSignature: 'stale-signature' }
    const check = validateActionScope(makeAction(stale), current)
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/sheet content changed/i)
  })
})

describe('isActionStale / collectStaleActionIds', () => {
  const current = captureActionScope(makeSource())

  it('flags only stale pending actions', () => {
    const fresh = { ...makeAction(current), id: 'fresh' }
    const stale = { ...makeAction({ ...current, sheetId: 'sheet-b' }), id: 'stale' }
    const resolved = { ...makeAction(current), id: 'resolved', status: 'applied' as const }
    expect(isActionStale(fresh, current)).toBe(false)
    expect(isActionStale(stale, current)).toBe(true)

    const ids = collectStaleActionIds(
      [{ actions: [fresh, stale] }, { actions: [resolved] }, {}],
      current,
    )
    expect([...ids]).toEqual(['stale'])
  })
})
