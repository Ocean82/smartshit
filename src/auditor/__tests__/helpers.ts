/** Shared builders for auditor rule tests. */
import type { SheetData } from '@/types'
import { runAudit } from '../index'
import { refToCell } from '../utils'

export type TestCells = SheetData['cells']

export function sheetOf(cells: TestCells, id = 's1', name = 'Sheet1'): SheetData {
  return { id, name, cells, columnWidths: {}, rowHeights: {}, charts: [] }
}

/** Runs the full audit with the raw cell values as "computed" values. */
export function audit(cells: TestCells, computed?: (cellId: string) => string) {
  return runAudit(sheetOf(cells), (row, col) => {
    const id = refToCell(row, col)
    if (computed) return computed(id)
    const c = cells[id]
    return c?.value == null ? '' : String(c.value)
  })
}

/** Findings from one rule only. */
export function findingsOf(cells: TestCells, ruleId: string, computed?: (cellId: string) => string) {
  return audit(cells, computed).findings.filter((f) => f.ruleId === ruleId)
}

/** Fill-down helper: `fill('B', 2, 6, (r) => `=A${r}*2`)`. */
export function fill(col: string, from: number, to: number, make: (row: number) => string | number): TestCells {
  const out: TestCells = {}
  for (let r = from; r <= to; r++) {
    const v = make(r)
    out[`${col}${r}`] = typeof v === 'string' && v.startsWith('=') ? { value: null, formula: v } : { value: v }
  }
  return out
}
