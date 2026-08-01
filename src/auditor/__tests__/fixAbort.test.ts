/**
 * Unit tests: getFixAbortReason — whether a batch of fix writes can be applied
 * without overwriting occupied target cells.
 */

import { describe, expect, it } from 'vitest'
import { getFixAbortReason } from '../index'
import type { SheetData } from '@/types'
import type { FixWrite } from '../types'

function makeSheet(cells: SheetData['cells']): SheetData {
  return {
    id: 'abort-test',
    name: 'Abort',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
}

describe('getFixAbortReason', () => {
  it('returns null for an empty action list', () => {
    expect(getFixAbortReason(makeSheet({}), [])).toBeNull()
  })

  it('returns null when the value-write target cell does not exist', () => {
    const actions: FixWrite[] = [{ cellId: 'C2', value: 0.335 }]
    expect(getFixAbortReason(makeSheet({}), actions)).toBeNull()
  })

  it('returns null when the value-write target cell is empty', () => {
    const actions: FixWrite[] = [{ cellId: 'C2', value: 0.335 }]
    expect(getFixAbortReason(makeSheet({ C2: { value: '' } }), actions)).toBeNull()
  })

  it('returns a message containing the cellId when the target already has a value', () => {
    const actions: FixWrite[] = [{ cellId: 'C2', value: 0.335 }]
    const reason = getFixAbortReason(makeSheet({ C2: { value: 99 } }), actions)
    expect(reason).not.toBeNull()
    expect(reason).toContain('C2')
  })

  it('returns a message when the target cell has a formula', () => {
    const actions: FixWrite[] = [{ cellId: 'C2', value: 0.335 }]
    const reason = getFixAbortReason(makeSheet({ C2: { value: null, formula: '=B1*2' } }), actions)
    expect(reason).not.toBeNull()
    expect(reason).toContain('C2')
  })

  it('returns null when all actions are formula writes', () => {
    const actions: FixWrite[] = [{ cellId: 'B2', formula: '=B1*C2' }]
    expect(getFixAbortReason(makeSheet({ B2: { value: 100 } }), actions)).toBeNull()
  })
})
