/**
 * Rule: Hardcoded Constants
 * Detects "magic numbers" embedded directly in formulas that should
 * probably be input cells. Structural constants (0 to 10, 12, 24, 52, 60,
 * 100, 365, 1000 and similar) are excluded. Rates such as a tax or markup
 * (0.08, 1.2) are deliberately NOT excluded: a wrong rate is a common error.
 */

import type { AuditRule, AuditFinding, AuditContext, FixWrite } from '../types'
import { findingId, refToCell, findNumericLiterals } from '../utils'

/** Numbers that are commonly used as formula constants and aren't suspicious. */
const ACCEPTABLE_CONSTANTS = new Set([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '12', '24', '30', '31', '52', '60', '100', '365', '366',
  '1000', '0.5', '0.01', '0.1',
  // Common denominators and statistical
  '7', '14', '26', '90', '180', '360',
])

/** `.50`, `1.0` and `1E1` compare equal to their canonical form. */
const canonical = (text: string) => String(Number(text))

/** First empty cell in the row, scanning right from the formula's column. */
function findFirstEmptyCellRight(ctx: AuditContext, row: number, col: number): string | null {
  for (let c = col + 1; c <= col + 50; c++) {
    if (!ctx.getCellAt(row, c)) return refToCell(row, c)
  }
  return null
}

export const hardcodedConstantsRule: AuditRule = {
  id: 'hardcoded-constants',
  name: 'Hardcoded Constants',
  description: 'Detects magic numbers embedded in formulas',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue

      const suspicious = findNumericLiterals(cell.formula).filter((n) => !ACCEPTABLE_CONSTANTS.has(canonical(n.text)))
      if (suspicious.length === 0) continue

      // The fix moves the first suspicious constant; the message lists them all.
      const first = suspicious[0]
      const target = findFirstEmptyCellRight(ctx, cell.row, cell.col)
      // Positional rewrite: only that literal changes, never a reference or quoted text.
      const fixActions: FixWrite[] | undefined = target
        ? [
            { cellId: target, value: Number(first.text) },
            {
              cellId: cell.cellId,
              formula: `=${cell.formula.slice(0, first.start)}${target}${cell.formula.slice(first.start + first.text.length)}`,
            },
          ]
        : undefined

      const all = [...new Set(suspicious.map((n) => n.text))]
      findings.push({
        id: findingId(),
        ruleId: 'hardcoded-constants',
        severity: 'medium',
        title: `Magic number ${first.text} in ${cell.cellId}`,
        message: `Cell ${cell.cellId} has hardcoded ${all.length > 1 ? `values ${all.join(', ')}` : `value ${first.text}`} in formula =${cell.formula}. Hardcoded values are fragile — if the number changes, you have to find every formula that uses it.`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: `Move ${first.text} to a dedicated input cell and reference that cell instead`,
        autoFixable: !!fixActions,
        fixActions,
      })
    }

    return findings
  },
}
