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
import {
  findingId,
  isSummaryCell,
  buildFormulaCellIndex,
  referencedFormulaCells,
  MAX_REFERENCE_EDGES,
} from '../utils'

export const orphanedFormulasRule: AuditRule = {
  id: 'orphaned-formulas',
  name: 'Orphaned Formulas',
  description: 'Detects formula cells not referenced by any other cell',
  defaultSeverity: 'low',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    let referenced: Set<string> | null = null
    const formulasPerCol = new Map<number, number>()
    for (const cell of ctx.formulaCells) {
      formulasPerCol.set(cell.col, (formulasPerCol.get(cell.col) ?? 0) + 1)
    }

    // Cheapest skips first: the column scan in isSummaryCell is O(column) per cell.
    for (const cell of ctx.formulaCells) {
      // Skip if it's surrounded by other formulas in the same column (part of a calculation series)
      if ((formulasPerCol.get(cell.col) ?? 0) >= 2) continue

      // Skip if the cell is in a row with other data (it's likely a user-facing output)
      if (ctx.getRow(cell.row).length >= 2) continue

      // Skip summary/total cells — they're expected to be unreferenced output
      if (isSummaryCell(cell, ctx.getColumn(cell.col))) continue

      referenced ??= buildReferencedSet(ctx)
      if (!referenced) return []
      if (referenced.has(cell.cellId)) continue

      findings.push({
        id: findingId(),
        ruleId: 'orphaned-formulas',
        severity: 'low',
        title: `Orphaned formula in ${cell.cellId}`,
        message: `${cell.cellId} (=${cell.formula}) is not referenced by any other cell and appears isolated. It may be unused or a leftover from earlier work.`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: 'Verify this formula is still needed, or remove it to reduce clutter',
        autoFixable: false,
      })
    }

    return findings
  },
}

/** Formula cells referenced by at least one formula, or null if the edge budget ran out. */
function buildReferencedSet(ctx: AuditContext): Set<string> | null {
  const index = buildFormulaCellIndex(ctx.formulaCells)
  const referenced = new Set<string>()
  let budget = MAX_REFERENCE_EDGES
  for (const cell of ctx.formulaCells) {
    if (!cell.formula) continue
    const refs = referencedFormulaCells(cell.formula, ctx.sheetName, index, budget + 1)
    if (refs.length > budget) return null
    budget -= refs.length
    for (const ref of refs) referenced.add(ref)
  }
  return referenced
}
