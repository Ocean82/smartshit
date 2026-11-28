/**
 * Rule: Overwritten Formulas
 * Detects a typed number sitting inside a run of formulas that share one
 * pattern: someone pasted or typed a value over a formula in a filled-down
 * column (or filled-right row). The cell keeps looking right until its inputs
 * change, so it is a classic silent error.
 *
 * Only numbers strictly between the first and last formula of a block are
 * flagged, so inputs above or below the run and separate tables are ignored.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, normalizeFormula, colToLetter, splitIntoBlocks, type Axis } from '../utils'

const MIN_FORMULAS = 3
/** Share of formula cells that must agree on one pattern. */
const PATTERN_AGREEMENT = 0.7
/** Share of the block's formulas-plus-numbers that must be formulas. */
const FORMULA_SHARE = 0.7

export const overwrittenFormulasRule: AuditRule = {
  id: 'overwritten-formula',
  name: 'Overwritten Formulas',
  description: 'Detects typed numbers inside a run of formulas that share a pattern',
  defaultSeverity: 'high',

  run(ctx: AuditContext): AuditFinding[] {
    const found = new Map<string, AuditFinding>()
    const scan = (cells: CellInfo[], axis: Axis, label: string) => {
      for (const block of splitIntoBlocks(cells, axis)) {
        for (const finding of checkBlock(block, axis, label)) {
          if (!found.has(finding.cells[0].cellId)) found.set(finding.cells[0].cellId, finding)
        }
      }
    }

    for (let col = 0; col <= ctx.maxCol; col++) scan(ctx.getColumn(col), 'column', `column ${colToLetter(col)}`)
    for (let row = 0; row <= ctx.maxRow; row++) scan(ctx.getRow(row), 'row', `row ${row + 1}`)

    return [...found.values()]
  },
}

function checkBlock(block: CellInfo[], axis: Axis, label: string): AuditFinding[] {
  const position = (c: CellInfo) => (axis === 'column' ? c.row : c.col)
  const formulas = block.filter((c) => c.formula)
  if (formulas.length < MIN_FORMULAS) return []

  const numbers = block.filter((c) => c.type === 'number')
  if (numbers.length === 0 || formulas.length / (formulas.length + numbers.length) < FORMULA_SHARE) return []

  const counts = new Map<string, number>()
  for (const c of formulas) {
    const pattern = normalizeFormula(c.formula!, c.row, c.col)
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1)
  }
  if (Math.max(...counts.values()) / formulas.length < PATTERN_AGREEMENT) return []

  const first = Math.min(...formulas.map(position))
  const last = Math.max(...formulas.map(position))

  return numbers
    .filter((c) => position(c) > first && position(c) < last)
    .map((cell) => ({
      id: findingId(),
      ruleId: 'overwritten-formula',
      severity: 'high' as const,
      title: `Typed number inside formulas in ${cell.cellId}`,
      message: `${cell.cellId} holds the number ${cell.rawValue} but the cells around it in ${label} are formulas. A formula was probably overwritten, so this value will not update when its inputs change.`,
      cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
      suggestion: `Restore the formula in ${cell.cellId}, copying it from a neighbouring cell, or confirm the number is intentional`,
      autoFixable: false,
    }))
}
