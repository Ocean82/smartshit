import { describe, expect, it } from 'vitest'
import { buildRelocatePlan } from './relocateRange'

describe('buildRelocatePlan', () => {
  const source = { startRow: 0, startCol: 0, endRow: 1, endCol: 0 }
  const cells = {
    A1: { value: 1 },
    A2: { value: 2, formula: '=A1+1' },
  }

  it('returns null when destination origin matches source', () => {
    expect(buildRelocatePlan({
      cells,
      source,
      destRow: 0,
      destCol: 0,
      mode: 'move',
    })).toBeNull()
  })

  it('copies without clears and adjusts formulas', () => {
    const plan = buildRelocatePlan({
      cells,
      source,
      destRow: 0,
      destCol: 1,
      mode: 'copy',
    })
    expect(plan).not.toBeNull()
    expect(plan!.clears).toEqual([])
    expect(plan!.writes).toEqual([
      { cellId: 'B1', data: { value: 1 } },
      { cellId: 'B2', data: { value: 2, formula: '=B1+1' } },
    ])
    expect(plan!.destSelection).toEqual({ startRow: 0, startCol: 1, endRow: 1, endCol: 1 })
  })

  it('move clears source cells that are not destination writes', () => {
    const plan = buildRelocatePlan({
      cells,
      source,
      destRow: 2,
      destCol: 0,
      mode: 'move',
    })
    expect(plan!.writes.map((w) => w.cellId)).toEqual(['A3', 'A4'])
    expect(plan!.clears).toEqual(['A1', 'A2'])
  })

  it('move overlapping dest does not clear overwritten dest cells', () => {
    // Move A1:A2 down by 1 → dest A2:A3; A2 is both source and dest — keep write, don't clear A2
    const plan = buildRelocatePlan({
      cells,
      source,
      destRow: 1,
      destCol: 0,
      mode: 'move',
    })
    expect(plan!.clears).toEqual(['A1'])
    expect(plan!.writes.map((w) => w.cellId)).toEqual(['A2', 'A3'])
  })
})
