/**
 * Rule: Volatile Functions
 * Flags use of volatile/fragile functions (NOW, TODAY, RAND, INDIRECT, OFFSET)
 * that recalculate on every change or break when structure changes.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId } from '../utils'

const VOLATILE_FUNCTIONS: Array<{ name: string; risk: string; suggestion: string }> = [
  { name: 'NOW', risk: 'Recalculates on every change', suggestion: 'Use a static date value if real-time updates are not needed' },
  { name: 'TODAY', risk: 'Recalculates daily', suggestion: 'Use a static date value if real-time updates are not needed' },
  { name: 'RAND', risk: 'Returns a new random value on every recalculation', suggestion: 'If you need a fixed random value, paste the result as a value' },
  { name: 'RANDBETWEEN', risk: 'Returns a new random value on every recalculation', suggestion: 'If you need a fixed random value, paste the result as a value' },
  { name: 'INDIRECT', risk: 'Breaks silently when cells are moved or renamed', suggestion: 'Use INDEX/MATCH instead for more robust references' },
  { name: 'OFFSET', risk: 'Fragile — breaks when rows/columns are inserted or deleted', suggestion: 'Use INDEX with explicit ranges instead' },
]

export const volatileFunctionsRule: AuditRule = {
  id: 'volatile-functions',
  name: 'Volatile Functions',
  description: 'Flags volatile or fragile functions that recalculate unpredictably',
  defaultSeverity: 'info',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue

      const upper = cell.formula.toUpperCase()

      for (const vf of VOLATILE_FUNCTIONS) {
        if (upper.includes(`${vf.name}(`)) {
          findings.push({
            id: findingId(),
            ruleId: 'volatile-functions',
            severity: 'info',
            title: `${vf.name}() in ${cell.cellId}`,
            message: `Cell ${cell.cellId} uses ${vf.name}(). ${vf.risk}. Formula: =${cell.formula}`,
            cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
            suggestion: vf.suggestion,
            autoFixable: false,
          })
          break // Only report the first volatile function per cell
        }
      }
    }

    return findings
  },
}
