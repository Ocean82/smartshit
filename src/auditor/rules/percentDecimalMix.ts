/**
 * Rule: Percent / Decimal Mix
 * Detects a rate column that mixes fractions (0.05) with whole-number percents
 * (5). A value typed as 8 where 0.08 was meant is 100 times too big, and it
 * looks plausible on screen.
 *
 * Needs a rate-like header (Rate, %, Margin, Growth, ...) because without
 * number formats a plain numeric column carries no sign of being a percentage.
 * The value 1 is ignored: it is both 100% and the number one.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, colToLetter, splitIntoBlocks } from '../utils'

const MIN_VALUES = 5
/** Share of judged values the majority style must hold. */
const MAJORITY = 0.7
const RATE_HEADER_RE = /%|percent|\bpct\b|\brate\b|margin|growth|yield|discount|\btax\b|share|ratio/i

export const percentDecimalMixRule: AuditRule = {
  id: 'percent-decimal-mix',
  name: 'Percent / Decimal Mix',
  description: 'Detects rate columns that mix fractions and whole-number percents',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (let col = 0; col <= ctx.maxCol; col++) {
      for (const block of splitIntoBlocks(ctx.getColumn(col), 'column')) {
        const header = block[0]
        if (header.type !== 'string' || typeof header.rawValue !== 'string' || !RATE_HEADER_RE.test(header.rawValue)) continue

        const fractions: CellInfo[] = []
        const wholes: CellInfo[] = []
        for (const cell of block) {
          if (cell.type !== 'number' || typeof cell.rawValue !== 'number') continue
          const magnitude = Math.abs(cell.rawValue)
          if (magnitude > 0 && magnitude < 1) fractions.push(cell)
          else if (magnitude > 1 && magnitude <= 100) wholes.push(cell)
        }

        const judged = fractions.length + wholes.length
        if (judged < MIN_VALUES) continue
        const majorityIsFractions = fractions.length >= wholes.length
        const majority = majorityIsFractions ? fractions : wholes
        const minority = majorityIsFractions ? wholes : fractions
        if (minority.length === 0 || majority.length / judged < MAJORITY) continue

        const style = majorityIsFractions ? 'fractions such as 0.05' : 'whole-number percents such as 5'
        const other = majorityIsFractions ? 'a whole number' : 'a fraction'
        const cells = minority.sort((a, b) => a.row - b.row)
        findings.push({
          id: findingId(),
          ruleId: 'percent-decimal-mix',
          severity: 'medium',
          title: `Percent and decimal mixed in column ${colToLetter(col)}`,
          message: `"${header.rawValue}" mostly holds ${style}, but ${cells.map((c) => `${c.cellId} (${c.rawValue})`).join(', ')} ${cells.length > 1 ? 'are' : 'is'} ${other}. That value is off by a factor of 100 if it was meant as a rate.`,
          cells: cells.map((c) => ({ cellId: c.cellId, row: c.row, col: c.col })),
          suggestion: `Enter ${cells.length > 1 ? 'them' : 'it'} the same way as the rest of the column`,
          autoFixable: false,
        })
      }
    }

    return findings
  },
}
