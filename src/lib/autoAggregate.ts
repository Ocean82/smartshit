/**
 * Pure AutoSum / aggregate placement (Excel-like: below columns or right of rows).
 */
import type { Selection } from '@/types'
import { colToLetter, refToCell } from '@/engine/spreadsheet'

export type AggregateFn = 'SUM' | 'AVERAGE' | 'COUNT' | 'MAX' | 'MIN'

export interface AutoAggregateWrite {
  cellId: string
  formula: string
}

export interface AutoAggregatePlan {
  writes: AutoAggregateWrite[]
  focus: Selection
}

export function buildAutoAggregatePlan(args: {
  selection: Selection
  fn: AggregateFn
  maxRow: number
  maxCol: number
}): AutoAggregatePlan | null {
  const sr0 = Math.min(args.selection.startRow, args.selection.endRow)
  const sr1 = Math.max(args.selection.startRow, args.selection.endRow)
  const sc0 = Math.min(args.selection.startCol, args.selection.endCol)
  const sc1 = Math.max(args.selection.startCol, args.selection.endCol)
  const nRows = sr1 - sr0 + 1
  const nCols = sc1 - sc0 + 1
  const goDown = nCols === 1 || nRows >= nCols
  const writes: AutoAggregateWrite[] = []

  if (goDown) {
    const targetRow = sr1 + 1
    if (targetRow > args.maxRow) return null
    for (let c = sc0; c <= sc1; c++) {
      const range = `${colToLetter(c)}${sr0 + 1}:${colToLetter(c)}${sr1 + 1}`
      writes.push({ cellId: refToCell(targetRow, c), formula: `=${args.fn}(${range})` })
    }
  } else {
    const targetCol = sc1 + 1
    if (targetCol > args.maxCol) return null
    for (let r = sr0; r <= sr1; r++) {
      const range = `${colToLetter(sc0)}${r + 1}:${colToLetter(sc1)}${r + 1}`
      writes.push({ cellId: refToCell(r, targetCol), formula: `=${args.fn}(${range})` })
    }
  }

  if (writes.length === 0) return null
  const focusRow = goDown ? sr1 + 1 : sr0
  const focusCol = goDown ? sc0 : sc1 + 1
  return {
    writes,
    focus: { startRow: focusRow, startCol: focusCol, endRow: focusRow, endCol: focusCol },
  }
}
