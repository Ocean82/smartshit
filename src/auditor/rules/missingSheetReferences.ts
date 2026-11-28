/**
 * Rule: Missing Sheet References
 * Detects formulas that point at a sheet the workbook does not have, for
 * example after the sheet was renamed or deleted. Imported formulas keep their
 * saved values until edited, so the sheet can look fine while the link is dead.
 *
 * Runs only with workbook context; without the sheet list it cannot tell a
 * missing sheet from a sheet it was not told about.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId } from '../utils'
import { extractFormulaRefs } from '@/lib/formulaRefs'

export const missingSheetReferencesRule: AuditRule = {
  id: 'missing-sheet-reference',
  name: 'Missing Sheet References',
  description: 'Detects formulas that reference a sheet that does not exist',
  defaultSeverity: 'critical',

  run(ctx: AuditContext): AuditFinding[] {
    if (!ctx.workbook) return []
    const known = new Set(ctx.workbook.sheets.map((s) => s.name.toLowerCase()))
    const findings: AuditFinding[] = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula) continue
      const missing = new Set<string>()
      for (const ref of extractFormulaRefs(cell.formula)) {
        if (ref.sheet !== null && !known.has(ref.sheet.toLowerCase())) missing.add(ref.sheet)
      }
      if (missing.size === 0) continue

      const names = [...missing].map((n) => `"${n}"`).join(', ')
      findings.push({
        id: findingId(),
        ruleId: 'missing-sheet-reference',
        severity: 'critical',
        title: `Reference to missing sheet in ${cell.cellId}`,
        message: `${cell.cellId} reads from ${missing.size > 1 ? 'sheets' : 'sheet'} ${names}, which ${missing.size > 1 ? 'are' : 'is'} not in this workbook. The formula cannot calculate. Formula: =${cell.formula}`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: 'Point the formula at the sheet it should read from, or restore or rename the missing sheet',
        autoFixable: false,
      })
    }

    return findings
  },
}
