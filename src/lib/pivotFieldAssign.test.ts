import { describe, expect, it } from 'vitest'
import { assignPivotField, unassignPivotField, EMPTY_PIVOT_ASSIGN } from './pivotFieldAssign'

describe('assignPivotField', () => {
  it('assigns a field to values by tap without requiring drag', () => {
    const next = assignPivotField(EMPTY_PIVOT_ASSIGN, 'B', 'value')
    expect(next.valueFields).toEqual([{ col: 'B', agg: 'sum' }])
  })

  it('moves a field when assigned to a different zone', () => {
    const rows = assignPivotField(EMPTY_PIVOT_ASSIGN, 'A', 'row')
    const values = assignPivotField(rows, 'A', 'value')
    expect(values.rowFields).toEqual([])
    expect(values.valueFields).toEqual([{ col: 'A', agg: 'sum' }])
  })
})

describe('unassignPivotField', () => {
  it('returns a field to the available pool', () => {
    const assigned = assignPivotField(EMPTY_PIVOT_ASSIGN, 'C', 'col')
    expect(unassignPivotField(assigned, 'C')).toEqual(EMPTY_PIVOT_ASSIGN)
  })
})
