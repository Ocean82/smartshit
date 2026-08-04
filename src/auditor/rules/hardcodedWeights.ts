/**
 * Rule: Hardcoded Weights Detection
 *
 * Detects contiguous sequences of 4+ cells (in the same row or column)
 * with hardcoded numeric values having 4+ decimal places — suspected
 * model weight embedding.
 *
 * Flags with severity "medium" and suggests registering as a Model_Asset.
 * Supports finding suppression: dismissed findings are suppressed for
 * specific cells until their values change.
 *
 * Requirements: 8.2, 8.5
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo, DismissedFindingEntry } from '../types'
import { findingId } from '../utils'

/** Minimum contiguous cells to trigger a finding. */
const MIN_SEQUENCE_LENGTH = 4

/** Minimum decimal places to consider a value "high precision". */
const MIN_DECIMAL_PLACES = 4

const RULE_ID = 'hardcoded-weights'

/**
 * Check if a cell contains a hardcoded numeric value with >= MIN_DECIMAL_PLACES
 * decimal places (no formula).
 */
export function isHighPrecisionNumeric(cell: CellInfo): boolean {
  // Must not be a formula cell
  if (cell.formula) return false
  // Must be a numeric type
  if (cell.type !== 'number') return false

  const value = cell.rawValue
  if (typeof value !== 'number' || !isFinite(value)) return false

  // Check decimal places in the string representation
  const str = String(value)
  const dotIndex = str.indexOf('.')
  if (dotIndex === -1) return false

  const decimalPlaces = str.length - dotIndex - 1
  return decimalPlaces >= MIN_DECIMAL_PLACES
}

/**
 * Find contiguous runs of high-precision numeric cells in an ordered sequence.
 * Returns arrays of cells where each array has length >= MIN_SEQUENCE_LENGTH.
 */
export function findContiguousRuns(
  cells: CellInfo[],
  axis: 'row' | 'col',
): CellInfo[][] {
  if (cells.length < MIN_SEQUENCE_LENGTH) return []

  // Sort cells by position along the axis
  const sorted = [...cells].sort((a, b) => {
    return axis === 'row' ? a.col - b.col : a.row - b.row
  })

  const runs: CellInfo[][] = []
  let currentRun: CellInfo[] = []

  for (let i = 0; i < sorted.length; i++) {
    const cell = sorted[i]

    if (!isHighPrecisionNumeric(cell)) {
      // End current run
      if (currentRun.length >= MIN_SEQUENCE_LENGTH) {
        runs.push(currentRun)
      }
      currentRun = []
      continue
    }

    // Check if contiguous with previous cell in the run
    if (currentRun.length > 0) {
      const prev = currentRun[currentRun.length - 1]
      const prevPos = axis === 'row' ? prev.col : prev.row
      const currPos = axis === 'row' ? cell.col : cell.row

      if (currPos - prevPos === 1) {
        currentRun.push(cell)
      } else {
        // Gap detected — end current run
        if (currentRun.length >= MIN_SEQUENCE_LENGTH) {
          runs.push(currentRun)
        }
        currentRun = [cell]
      }
    } else {
      currentRun = [cell]
    }
  }

  // Don't forget the last run
  if (currentRun.length >= MIN_SEQUENCE_LENGTH) {
    runs.push(currentRun)
  }

  return runs
}

/**
 * Check if a set of cells should be suppressed based on dismissed findings.
 * A finding is suppressed if all cells are in the dismissed list AND their
 * values haven't changed since dismissal.
 */
export function isSuppressed(
  cells: CellInfo[],
  dismissed: DismissedFindingEntry | undefined,
): boolean {
  if (!dismissed) return false

  const dismissedCellSet = new Set(dismissed.cellIds)

  // All cells in this finding must be in the dismissed set
  const allDismissed = cells.every((c) => dismissedCellSet.has(c.cellId))
  if (!allDismissed) return false

  // If there's a value snapshot, check that values haven't changed
  if (dismissed.valueSnapshot) {
    for (const cell of cells) {
      const snapshotValue = dismissed.valueSnapshot[cell.cellId]
      if (snapshotValue !== undefined && snapshotValue !== cell.rawValue) {
        // Value has changed since dismissal — re-report
        return false
      }
    }
  }

  return true
}

export const hardcodedWeightsRule: AuditRule = {
  id: RULE_ID,
  name: 'Suspected Hardcoded Weights',
  description: 'Detects sequences of high-precision numeric constants that may be model weights',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []
    const dismissed = ctx.dismissedFindings?.[RULE_ID]

    // Track cells already flagged to avoid duplicate findings between row/col scans
    const flaggedCellKeys = new Set<string>()

    // Scan each row for contiguous runs
    for (let row = 0; row <= ctx.maxRow; row++) {
      const rowCells = ctx.getRow(row)
      const runs = findContiguousRuns(rowCells, 'row')

      for (const run of runs) {
        // Check suppression
        if (isSuppressed(run, dismissed)) continue

        const cellKey = run.map((c) => c.cellId).sort().join(',')
        if (flaggedCellKeys.has(cellKey)) continue
        flaggedCellKeys.add(cellKey)

        findings.push(createFinding(run, 'row', row))
      }
    }

    // Scan each column for contiguous runs
    for (let col = 0; col <= ctx.maxCol; col++) {
      const colCells = ctx.getColumn(col)
      const runs = findContiguousRuns(colCells, 'col')

      for (const run of runs) {
        // Check suppression
        if (isSuppressed(run, dismissed)) continue

        const cellKey = run.map((c) => c.cellId).sort().join(',')
        if (flaggedCellKeys.has(cellKey)) continue
        flaggedCellKeys.add(cellKey)

        findings.push(createFinding(run, 'col', col))
      }
    }

    return findings
  },
}

function createFinding(
  cells: CellInfo[],
  direction: 'row' | 'col',
  index: number,
): AuditFinding {
  const cellAddresses = cells.map((c) => c.cellId).join(', ')
  const directionLabel = direction === 'row' ? `row ${index + 1}` : `column ${String.fromCharCode(65 + index)}`

  return {
    id: findingId(),
    ruleId: RULE_ID,
    severity: 'medium',
    title: `Suspected hardcoded weights in ${directionLabel}`,
    message: `${cells.length} consecutive cells with high-precision numeric values detected in ${directionLabel}: ${cellAddresses}. These may be hardcoded model weights that should be managed as a Model_Asset.`,
    cells: cells.map((c) => ({ cellId: c.cellId, row: c.row, col: c.col })),
    suggestion: 'Consider registering these values as a Model_Asset for proper version tracking and audit compliance',
    autoFixable: false,
  }
}
