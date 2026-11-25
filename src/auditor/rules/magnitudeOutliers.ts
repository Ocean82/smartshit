/**
 * Rule: Magnitude Outliers
 * Detects numeric values that sit far outside the rest of their column, which
 * is useful for catching data entry errors like "1500" when it should be "150".
 *
 * Uses the modified z-score (Iglewicz & Hoaglin): 0.6745 * (x - median) / MAD,
 * flagged above 3.5. The median and MAD are not pulled around by the outlier,
 * so a huge value cannot hide itself the way it can with mean and standard
 * deviation, and several outliers do not mask each other. When more than half
 * of the values are identical (MAD is 0) the usual fallback scales by the mean
 * absolute deviation instead: (x - median) / (1.253314 * meanAD).
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, colToLetter } from '../utils'

/** Minimum numbers in a column before outlier detection applies (robust stats are noisy on tiny samples). */
const MIN_COLUMN_SIZE = 10

/** Modified z-score above which a value is flagged (3.5 is the standard cutoff). */
const MODIFIED_Z_THRESHOLD = 3.5

function median(sorted: number[]): number {
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Robust centre and a function scoring how far a value is from it, or null when the column has no spread. */
export function robustScorer(values: number[]): { center: number; score: (x: number) => number } | null {
  const sorted = [...values].sort((a, b) => a - b)
  const center = median(sorted)
  const mad = median(values.map((v) => Math.abs(v - center)).sort((a, b) => a - b))
  if (mad > 0) return { center, score: (x) => (0.6745 * (x - center)) / mad }
  const meanAd = values.reduce((sum, v) => sum + Math.abs(v - center), 0) / values.length
  if (meanAd === 0) return null // all values identical
  return { center, score: (x) => (x - center) / (1.253314 * meanAd) }
}

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

      const scorer = robustScorer(columnCells.map((c) => c.rawValue as number))
      if (!scorer) continue

      // Exclude cells that are likely totals/summaries (last row with data, or adjacent to a formula cell)
      const formulaCellRows = new Set(
        ctx.getColumn(col).filter((c) => c.type === 'formula').map((c) => c.row),
      )
      // Computed once: Math.max(...) per outlier was quadratic and throws on very large columns.
      const lastDataRow = columnCells.reduce((max, c) => (c.row > max ? c.row : max), -1)

      for (const cell of columnCells) {
        const value = cell.rawValue as number
        const score = scorer.score(value)
        if (Math.abs(score) <= MODIFIED_Z_THRESHOLD) continue
        // Skip if this cell is adjacent to a formula row (likely a manually-entered total)
        if (formulaCellRows.has(cell.row - 1) || formulaCellRows.has(cell.row + 1)) continue
        // Skip if this is the last data cell in the column (likely a total)
        if (cell.row === lastDataRow) continue

        const typical = scorer.center.toLocaleString(undefined, { maximumFractionDigits: 2 })
        findings.push({
          id: findingId(),
          ruleId: 'magnitude-outliers',
          severity: 'low',
          title: `Outlier value in ${cell.cellId}`,
          message: `Value ${value.toLocaleString()} in ${cell.cellId} is far outside the typical range of column ${colToLetter(col)} (median ${typical}). This may be a data entry error.`,
          cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
          suggestion: `Verify that ${value.toLocaleString()} is correct. It is unusually far from the other values in this column.`,
          autoFixable: false,
        })
      }
    }

    return findings
  },
}
