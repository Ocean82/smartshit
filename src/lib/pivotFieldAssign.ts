import type { PivotField } from '@/types'

export type PivotZone = 'row' | 'col' | 'value'

export interface PivotAssignState {
  rowFields: string[]
  colFields: string[]
  valueFields: { col: string; agg: PivotField['aggregation'] }[]
}

export const EMPTY_PIVOT_ASSIGN: PivotAssignState = {
  rowFields: [],
  colFields: [],
  valueFields: [],
}

function withoutCol(state: PivotAssignState, col: string): PivotAssignState {
  return {
    rowFields: state.rowFields.filter((c) => c !== col),
    colFields: state.colFields.filter((c) => c !== col),
    valueFields: state.valueFields.filter((v) => v.col !== col),
  }
}

/** Move a field into one zone. A column can only live in one zone at a time. */
export function assignPivotField(
  state: PivotAssignState,
  col: string,
  zone: PivotZone,
): PivotAssignState {
  const next = withoutCol(state, col)
  if (zone === 'row') return { ...next, rowFields: [...next.rowFields, col] }
  if (zone === 'col') return { ...next, colFields: [...next.colFields, col] }
  return { ...next, valueFields: [...next.valueFields, { col, agg: 'sum' }] }
}

export function unassignPivotField(state: PivotAssignState, col: string): PivotAssignState {
  return withoutCol(state, col)
}
