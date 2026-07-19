/**
 * Rule: Duplicate Formulas
 * Detects identical formulas that appear in multiple cells.
 * Exact duplicates (same raw formula text) repeated 3+ times may indicate
 * a copy-paste pattern that could be simplified or a logic error.
 *
 * Note: This intentionally checks raw formula text, NOT normalized patterns.
 * The inconsistentFormulas rule handles structural pattern breaks.
 * This rule catches verbatim clones that reference the SAME cells — a smell
 * that the user pasted without adjusting references.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId } from '../utils'

/** Minimum number of exact duplicates before flagging. */
const MIN_DUPLICATES = 3

export const duplicateFormulasRule: AuditRule = {
  id: 'duplicate-formulas',
  name: 'Duplicate Formulas',
  description: 'Detects identical formulas repeated across multiple cells',
  defaultSeverity: 'info',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Group formula cells by their exact (uppercased, trimmed) formula text
    const formulaMap = new Map<string, Array<{ cellId: string; row: number; col: number }>>()

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue
      const key = cell.formula.toUpperCase().trim()
      if (!formulaMap.has(key)) formulaMap.set(key, [])
      formulaMap.get(key)!.push({ cellId: cell.cellId, row: cell.row, col: cell.col })
    }

    for (const [formula, cells] of formulaMap) {
      if (cells.length < MIN_DUPLICATES) continue

      const addressList = cells.map((c) => c.cellId).join(', ')

      findings.push({
        id: findingId(),
        ruleId: 'duplicate-formulas',
        severity: 'info',
        title: `Identical formula repeated ${cells.length} times`,
        message: `Formula =${formula} appears verbatim in ${addressList}. This may indicate a copy-paste without adjusting references.`,
        cells: cells.map((c) => ({ cellId: c.cellId, row: c.row, col: c.col })),
        suggestion: 'Consider whether these cells should reference different data, or consolidate into a single formula with a shared reference',
        autoFixable: false,
      })
    }

    return findings
  },
}
