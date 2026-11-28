/**
 * Rule: Inconsistent Formulas
 * Detects cells that break a formula pattern established by their neighbors
 * in a row or column. For example, if B2:B9 all use "=C2-A2" pattern but
 * B5 uses "=C5*A5", that's flagged.
 *
 * A row or column is first split into blocks (two or more empty cells start a
 * new block), so separate tables stacked in the same columns are never
 * compared with each other. A cell that breaks the pattern both in its row and
 * in its column is reported once, against the larger agreeing group.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, normalizeFormula, colToLetter, isSummaryCell, splitIntoBlocks, type Axis } from '../utils'

/** Minimum cells needed to establish a pattern before flagging outliers. */
const MIN_PATTERN_SIZE = 3
/** What fraction of cells must share a pattern to consider it "dominant". */
const DOMINANCE_THRESHOLD = 0.7

interface Candidate {
  finding: AuditFinding
  /** How many other cells share the pattern this cell breaks. */
  dominantCount: number
}

export const inconsistentFormulasRule: AuditRule = {
  id: 'inconsistent-formulas',
  name: 'Inconsistent Formulas',
  description: 'Detects cells that break a formula pattern in a row or column',
  defaultSeverity: 'high',

  run(ctx: AuditContext): AuditFinding[] {
    // One entry per cell; a later group replaces it only with a stronger pattern.
    const best = new Map<string, Candidate>()
    const consider = (candidates: Candidate[]) => {
      for (const candidate of candidates) {
        const cellId = candidate.finding.cells[0].cellId
        const existing = best.get(cellId)
        if (!existing || candidate.dominantCount > existing.dominantCount) best.set(cellId, candidate)
      }
    }

    for (let col = 0; col <= ctx.maxCol; col++) {
      for (const block of splitIntoBlocks(ctx.getColumn(col), 'column')) {
        consider(checkGroup(block, 'column', colToLetter(col)))
      }
    }
    for (let row = 0; row <= ctx.maxRow; row++) {
      for (const block of splitIntoBlocks(ctx.getRow(row), 'row')) {
        consider(checkGroup(block, 'row', String(row + 1)))
      }
    }

    return [...best.values()].map((c) => c.finding)
  },
}

function checkGroup(cells: CellInfo[], direction: Axis, label: string): Candidate[] {
  const candidates: Candidate[] = []
  const formulaCells = cells.filter((c) => c.formula)

  if (formulaCells.length < MIN_PATTERN_SIZE) return candidates

  // Normalize each formula relative to its position
  const normalized = formulaCells.map((c) => ({
    cell: c,
    pattern: normalizeFormula(c.formula!, c.row, c.col),
  }))

  // Count occurrences of each pattern
  const patternCounts = new Map<string, number>()
  for (const { pattern } of normalized) {
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1)
  }

  // Find the dominant pattern
  let dominantPattern = ''
  let dominantCount = 0
  for (const [pattern, count] of patternCounts) {
    if (count > dominantCount) {
      dominantPattern = pattern
      dominantCount = count
    }
  }

  // Only flag if the dominant pattern is actually dominant
  if (dominantCount / formulaCells.length < DOMINANCE_THRESHOLD) return candidates

  // Flag cells that deviate from the dominant pattern
  for (const { cell, pattern } of normalized) {
    if (pattern === dominantPattern) continue

    // Skip summary/aggregate cells — a SUM at the bottom of a column of
    // item-level formulas is expected to differ, not an error.
    if (direction === 'column' && isSummaryCell(cell, cells)) continue

    const dirLabel = direction === 'column' ? `column ${label}` : `row ${label}`

    candidates.push({
      dominantCount,
      finding: {
        id: findingId(),
        ruleId: 'inconsistent-formulas',
        severity: 'high',
        title: `Formula pattern break in ${cell.cellId}`,
        message: `Cell ${cell.cellId} breaks the formula pattern in ${dirLabel}. ${dominantCount} other cells use a consistent pattern. Current formula: =${cell.formula}`,
        cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
        suggestion: `Review formula in ${cell.cellId} — it differs from the ${dominantCount} neighboring cells that share a common pattern`,
        autoFixable: false,
      },
    })
  }

  return candidates
}
