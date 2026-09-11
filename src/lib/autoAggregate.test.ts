import { describe, expect, it } from 'vitest'
import { buildAutoAggregatePlan } from './autoAggregate'

describe('buildAutoAggregatePlan', () => {
  const bounds = { maxRow: 99, maxCol: 25 }

  it('places SUM below a single column', () => {
    const plan = buildAutoAggregatePlan({
      selection: { startRow: 0, startCol: 1, endRow: 2, endCol: 1 },
      fn: 'SUM',
      ...bounds,
    })
    expect(plan!.writes).toEqual([{ cellId: 'B4', formula: '=SUM(B1:B3)' }])
    expect(plan!.focus).toEqual({ startRow: 3, startCol: 1, endRow: 3, endCol: 1 })
  })

  it('places AVERAGE right of a single row', () => {
    const plan = buildAutoAggregatePlan({
      selection: { startRow: 4, startCol: 0, endRow: 4, endCol: 2 },
      fn: 'AVERAGE',
      ...bounds,
    })
    expect(plan!.writes).toEqual([{ cellId: 'D5', formula: '=AVERAGE(A5:C5)' }])
  })

  it('places one formula per column below a tall block', () => {
    const plan = buildAutoAggregatePlan({
      selection: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      fn: 'MAX',
      ...bounds,
    })
    expect(plan!.writes).toEqual([
      { cellId: 'A4', formula: '=MAX(A1:A3)' },
      { cellId: 'B4', formula: '=MAX(B1:B3)' },
    ])
  })

  it('places one formula per row right of a wide block', () => {
    const plan = buildAutoAggregatePlan({
      selection: { startRow: 0, startCol: 0, endRow: 1, endCol: 2 },
      fn: 'COUNT',
      ...bounds,
    })
    expect(plan!.writes).toEqual([
      { cellId: 'D1', formula: '=COUNT(A1:C1)' },
      { cellId: 'D2', formula: '=COUNT(A2:C2)' },
    ])
  })

  it('returns null when target is out of bounds', () => {
    expect(buildAutoAggregatePlan({
      selection: { startRow: 99, startCol: 0, endRow: 99, endCol: 0 },
      fn: 'SUM',
      ...bounds,
    })).toBeNull()
  })
})
