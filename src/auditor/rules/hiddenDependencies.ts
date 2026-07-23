/**
 * Rule: Hidden Dependencies
 * Detects cross-sheet references (e.g., Sheet2!A1, 'My Sheet'!B2) in formulas.
 * These references are "hidden" because they depend on data the user may not
 * be looking at, and they break silently if the referenced sheet is renamed or deleted.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId } from '../utils'

/**
 * Matches cross-sheet references:
 * - Sheet2!A1
 * - 'Sheet Name'!B2:C10
 * - Sheet_1!$A$1
 */
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
      while ((match = CROSS_SHEET_PATTERN.exec(cell.formula)) !== null) {
        const sheetName = match[1] || match[2] // quoted or unquoted name
        // Skip if it references the current sheet (self-reference is fine)
        if (sheetName === ctx.sheetName) continue
        referencedSheets.add(sheetName)
      }

      if (referencedSheets.size > 0) {
        crossSheetCells.push({ cell, sheets: referencedSheets })
      }
    }

    // Only flag if there are few cross-sheet references (likely accidental).
    // In a multi-sheet workbook with many cross-refs, they're intentional architecture.
    if (crossSheetCells.length > 5) return findings

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
