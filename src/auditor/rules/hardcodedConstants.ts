/**
 * Rule: Hardcoded Constants
 * Detects "magic numbers" embedded directly in formulas that should
 * probably be input cells. Common acceptable constants (0, 1, 100, 12, etc.)
 * are excluded.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId } from '../utils'

/** Numbers that are commonly used as formula constants and aren't suspicious. */
const ACCEPTABLE_CONSTANTS = new Set([
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '12', '24', '30', '31', '52', '60', '100', '365', '366',
  '1000', '0.5', '0.01', '0.1',
])

export const hardcodedConstantsRule: AuditRule = {
  id: 'hardcoded-constants',
  name: 'Hardcoded Constants',
  description: 'Detects magic numbers embedded in formulas',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue

      // Strip cell references and range references so we don't false-flag them
      const stripped = cell.formula
        .replace(/[A-Z]{1,3}\d{1,5}:[A-Z]{1,3}\d{1,5}/g, '') // remove ranges
        .replace(/[A-Z]{1,3}\d{1,5}/g, '') // remove cell refs

      // Find numeric literals
      const numbers = stripped.match(/\b\d+\.?\d*\b/g)
      if (!numbers) continue

      const suspicious = numbers.filter((n) => !ACCEPTABLE_CONSTANTS.has(n))

      // Only report the first suspicious constant per cell to avoid noise
      if (suspicious.length > 0) {
        const num = suspicious[0]
        findings.push({
          id: findingId(),
          ruleId: 'hardcoded-constants',
          severity: 'medium',
          title: `Magic number ${num} in ${cell.cellId}`,
          message: `Cell ${cell.cellId} has hardcoded value ${num} in formula =${cell.formula}. Hardcoded values are fragile — if the number changes, you have to find every formula that uses it.`,
          cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
          suggestion: `Move ${num} to a dedicated input cell and reference that cell instead`,
          autoFixable: false,
        })
      }
    }

    return findings
  },
}
