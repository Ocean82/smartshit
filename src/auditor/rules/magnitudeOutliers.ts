/**
 * Rule: Magnitude Outliers
 * Detects numeric values that are statistical outliers (>3 std deviations)
 * within their column. Useful for catching data entry errors like
 * "1500" when it should be "150".
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, colToLetter } from '../utils'

/** Minimum data points in a column before outlier detection applies. */
const MIN_COLUMN_SIZE = 5
/** Z-score threshold for flagging a value as an outlier. */
const Z_SCORE_THRESHOLD = 3.0

export const magnitudeOutliersRule: AuditRule = {
  id: 'magnitude-outliers',
  name: 'Magnitude Outliers',
  description: 'Detects numeric values that are statistical outliers in their column',
  defaultSeverity: 'low',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (let col = 0; col <= ctx.maxCol; col++) {
      const columnCells = ctx.getColumn(col).filter(
        (c) => c.type === 'number' && typeof c.rawValue === 'number',
      )

      if (columnCells.length < MIN_COLUMN_SIZE) continue

      // Exclude cells that are likely totals/summaries (last row with data, or adjacent to a formula cell)
      const formulaCellRows = new Set(
        ctx.getColumn(col).filter((c) => c.type === 'formula').map((c) => c.row)
      )

      const values = columnCells.map((c) => c.rawValue as number)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, values.length - 1)
      const stddev = Math.sqrt(variance)

      if (stddev === 0) continue // All values are identical

      for (const cell of columnCells) {
        const value = cell.rawValue as number
        const zScore = Math.abs(value - mean) / stddev

        if (zScore > Z_SCORE_THRESHOLD) {
          // Skip if this cell is adjacent to a formula row (likely a manually-entered total)
          if (formulaCellRows.has(cell.row - 1) || formulaCellRows.has(cell.row + 1)) continue
          // Skip if this is the last data cell in the column (likely a total)
          if (cell.row === Math.max(...columnCells.map((c) => c.row))) continue

          findings.push({
            id: findingId(),
            ruleId: 'magnitude-outliers',
            severity: 'low',
            title: `Outlier value in ${cell.cellId}`,
            message: `Value ${value.toLocaleString()} in ${cell.cellId} (column ${colToLetter(col)}) is ${zScore.toFixed(1)}σ from the column mean (${mean.toFixed(2)}). This may be a data entry error.`,
            cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
            suggestion: `Verify that ${value.toLocaleString()} is correct — it's unusually far from the other values in this column`,
            autoFixable: false,
          })
        }
      }
    }

    return findings
  },
}
