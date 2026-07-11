/**
 * Rule: Orphaned Formulas
 * Detects formula cells that are not referenced by any other formula.
 * These may be leftover calculations that are no longer needed.
 *
 * Exception: summary/total cells at the bottom of a column are NOT flagged,
 * since they are typically the final output (e.g., a SUM at row 20
 * that nothing else references — that's normal, it's the "answer").
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, extractCellRefs, isSummaryCell } from '../utils'

export const orphanedFormulasRule: AuditRule = {
  id: 'orphaned-formulas',
  name: 'Orphaned Formulas',
  description: 'Detects formula cells not referenced by any other cell',
  defaultSeverity: 'low',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Build the set of all cells that are referenced by at least one formula
    const referenced = new Set<string>()
    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue
      const refs = extractCellRefs(cell.formula)
      for (const ref of refs) {
        referenced.add(ref)
      }
    }

    // Find formula cells that no one references
    for (const cell of ctx.formulaCells) {
      if (referenced.has(cell.cellId)) continue

      // Skip summary/total cells — they're expected to be unreferenced output
      const colCells = ctx.getColumn(cell.col)
      if (isSummaryCell(cell, colCells)) continue

      findings.push({
        id: findingId(),
        ruleId: 'orphaned-formulas',
        severity: 'low',
        title: `Orphaned formula in ${cell.cellId}`,
        message: `${cell.cellId} (=${cell.formula}) is not referenced by any other cell. It may be unused or a leftover from earlier work.`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: 'Verify this formula is still needed, or remove it to reduce clutter',
        autoFixable: false,
      })
    }

    return findings
  },
}
