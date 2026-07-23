/**
 * Rule: Error Cells
 * Detects cells containing formula errors (#REF!, #VALUE!, #DIV/0!, etc.)
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, isErrorValue, getErrorType } from '../utils'

const ERROR_DESCRIPTIONS: Record<string, string> = {
  '#REF!': 'Broken cell reference — a referenced cell was deleted or moved',
  '#VALUE!': 'Wrong value type — a formula expected a number but got text (or similar)',
  '#DIV/0!': 'Division by zero — a formula divides by an empty cell or zero',
  '#NAME?': 'Unrecognized function or named range — check spelling',
  '#NULL!': 'Invalid range intersection — check for missing operators',
  '#N/A': 'Value not available — a lookup function could not find a match',
  '#NUM!': 'Invalid numeric value — a number is too large, too small, or invalid',
}

const ERROR_SUGGESTIONS: Record<string, (formula: string | null) => string> = {
  '#REF!': () => 'Update the formula to reference valid cells, or re-enter it',
  '#VALUE!': () => 'Check that all referenced cells contain the expected data types',
  '#DIV/0!': (f) => f ? `Wrap in IFERROR: =IFERROR(${f}, 0)` : 'Add a check for zero before dividing',
  '#NAME?': () => 'Check function spelling and ensure any named ranges exist',
  '#N/A': (f) => f ? `Add error handling: =IFERROR(${f}, "Not found")` : 'Verify the lookup value exists in the source range',
  '#NULL!': () => 'Check for missing comma or colon between cell references',
  '#NUM!': () => 'Verify the numeric arguments are within valid ranges',
}

export const errorCellsRule: AuditRule = {
  id: 'error-cells',
  name: 'Formula Errors',
  description: 'Detects cells containing Excel error values',
  defaultSeverity: 'critical',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (const cell of ctx.allCells) {
      if (!isErrorValue(cell.computedValue)) continue

      const errorType = getErrorType(cell.computedValue) ?? '#ERROR!'
      const description = ERROR_DESCRIPTIONS[errorType] ?? 'Unknown error type'
      const getSuggestion = ERROR_SUGGESTIONS[errorType]
      const suggestion = getSuggestion ? getSuggestion(cell.formula) : 'Review and correct the formula'

      // Severity depends on error type — #REF! and #DIV/0! are critical; #N/A is often expected
      const errorSeverity: Record<string, 'critical' | 'high' | 'medium'> = {
        '#REF!': 'critical',
        '#DIV/0!': 'critical',
        '#VALUE!': 'high',
        '#NULL!': 'high',
        '#NUM!': 'high',
        '#NAME?': 'medium',
        '#N/A': 'medium',
      }
      const severity = errorSeverity[errorType] ?? 'high'

      // Auto-fixable: #DIV/0! can be wrapped in IFERROR
      const autoFixable = errorType === '#DIV/0!' && !!cell.formula
      const fixAction = autoFixable && cell.formula
        ? { cellId: cell.cellId, formula: `=IFERROR(${cell.formula}, 0)` }
        : undefined

      findings.push({
        id: findingId(),
        ruleId: 'error-cells',
        severity,
        title: `${errorType} in ${cell.cellId}`,
        message: `Cell ${cell.cellId} contains ${errorType}. ${description}.${cell.formula ? ` Formula: =${cell.formula}` : ''}`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion,
        autoFixable,
        fixAction,
      })
    }

    return findings
  },
}
