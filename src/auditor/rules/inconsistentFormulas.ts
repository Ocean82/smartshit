/**
 * Rule: Inconsistent Formulas
 * Detects cells that break a formula pattern established by their neighbors
 * in a row or column. For example, if B2:B9 all use "=C2-A2" pattern but
 * B5 uses "=C5*A5", that's flagged.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, normalizeFormula, colToLetter } from '../utils'

/** Minimum cells needed to establish a pattern before flagging outliers. */
const MIN_PATTERN_SIZE = 3
/** What fraction of cells must share a pattern to consider it "dominant". */
const DOMINANCE_THRESHOLD = 0.7

export const inconsistentFormulasRule: AuditRule = {
  id: 'inconsistent-formulas',
  name: 'Inconsistent Formulas',
  description: 'Detects cells that break a formula pattern in a row or column',
  defaultSeverity: 'high',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Check columns
    for (let col = 0; col <= ctx.maxCol; col++) {
      const colFindings = checkGroup(ctx.getColumn(col), 'column', colToLetter(col))
      findings.push(...colFindings)
    }

    // Check rows
    for (let row = 0; row <= ctx.maxRow; row++) {
      const rowFindings = checkGroup(ctx.getRow(row), 'row', String(row + 1))
      findings.push(...rowFindings)
    }

    return findings
  },
}

function checkGroup(cells: CellInfo[], direction: 'row' | 'column', label: string): AuditFinding[] {
  const findings: AuditFinding[] = []
  const formulaCells = cells.filter((c) => c.formula)

  if (formulaCells.length < MIN_PATTERN_SIZE) return findings

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
  if (dominantCount / formulaCells.length < DOMINANCE_THRESHOLD) return findings

  // Flag cells that deviate from the dominant pattern
  for (const { cell, pattern } of normalized) {
    if (pattern === dominantPattern) continue

    const dirLabel = direction === 'column' ? `column ${label}` : `row ${label}`

    findings.push({
      id: findingId(),
      ruleId: 'inconsistent-formulas',
      severity: 'high',
      title: `Formula pattern break in ${cell.cellId}`,
      message: `Cell ${cell.cellId} breaks the formula pattern in ${dirLabel}. ${dominantCount} other cells use a consistent pattern. Current formula: =${cell.formula}`,
      cells: [{ cellId: cell.cellId, row: cell.row, col: cell.col }],
      suggestion: `Review formula in ${cell.cellId} — it differs from the ${dominantCount} neighboring cells that share a common pattern`,
      autoFixable: false,
    })
  }

  return findings
}
