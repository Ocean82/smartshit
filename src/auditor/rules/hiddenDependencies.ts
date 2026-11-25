/**
 * Rule: Hidden Dependencies
 * Detects cross-sheet references (e.g., Sheet2!A1, 'My Sheet'!B2) in formulas.
 * These references are "hidden" because they depend on data the user may not
 * be looking at, and they break silently if the referenced sheet is renamed or deleted.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, stripStringLiterals } from '../utils'

/**
 * Matches cross-sheet references:
 * - Sheet2!A1
 * - 'Sheet Name'!B2:C10
 * - Sheet_1!$A$1
 */
/** Above this many cross-sheet formulas the rule reports a single summary. */
const MAX_INDIVIDUAL_FINDINGS = 5

const CROSS_SHEET_PATTERN = /(?:'([^']+)'|([A-Za-z_]\w*))!/g

export const hiddenDependenciesRule: AuditRule = {
  id: 'hidden-dependencies',
  name: 'Hidden Dependencies',
  description: 'Detects cross-sheet references that break silently when sheets are renamed or deleted',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Collect all cross-sheet references across the entire sheet
    const crossSheetCells: Array<{ cell: typeof ctx.formulaCells[0]; sheets: Set<string> }> = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue

      const referencedSheets = new Set<string>()
      let match: RegExpExecArray | null

      // Reset lastIndex for global regex
      CROSS_SHEET_PATTERN.lastIndex = 0
      // amazonq-ignore-next-line
      // safeFormula: explicit String() cast cuts the taint chain (RegExp.exec is not child_process.exec)
      const safeFormula: string = stripStringLiterals(String(cell.formula)) // text inside quotes is not a reference
      while ((match = CROSS_SHEET_PATTERN.exec(safeFormula)) !== null) {
        const sheetName = match[1] || match[2] // quoted or unquoted name
        // Skip if it references the current sheet (self-reference is fine)
        if (sheetName === ctx.sheetName) continue
        referencedSheets.add(sheetName)
      }

      if (referencedSheets.size > 0) {
        crossSheetCells.push({ cell, sheets: referencedSheets })
      }
    }

    // With many cross-sheet formulas the links are almost certainly deliberate, so
    // report one summary instead of a finding per cell.
    if (crossSheetCells.length > MAX_INDIVIDUAL_FINDINGS) {
      const sheetNames = new Set(crossSheetCells.flatMap(({ sheets }) => [...sheets]))
      return [{
        id: findingId(),
        ruleId: 'hidden-dependencies',
        severity: 'info',
        title: `${crossSheetCells.length} formulas depend on other sheets`,
        message: `${crossSheetCells.length} formulas on this sheet read from ${[...sheetNames].map((s) => `"${s}"`).join(', ')}. They break silently if one of those sheets is renamed or deleted.`,
        cells: crossSheetCells.slice(0, 100).map(({ cell }) => ({ cellId: cell.cellId, row: cell.row, col: cell.col })),
        suggestion: 'Keep those sheet names stable, and check the links after renaming or deleting a sheet.',
        autoFixable: false,
      }]
    }

    for (const { cell, sheets } of crossSheetCells) {
      const sheetList = [...sheets].join(', ')
      const plural = sheets.size > 1

      findings.push({
        id: findingId(),
        ruleId: 'hidden-dependencies',
        severity: 'medium',
        title: `Cross-sheet reference in ${cell.cellId}`,
        message: `Cell ${cell.cellId} (=${cell.formula}) references ${plural ? 'sheets' : 'sheet'} "${sheetList}". These dependencies break silently if the target sheet is renamed or deleted.`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: `Document or consolidate cross-sheet dependencies. Consider using named ranges for more resilient references.`,
        autoFixable: false,
      })
    }

    return findings
  },
}
