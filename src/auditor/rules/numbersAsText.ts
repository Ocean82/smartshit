/**
 * Rule: Numbers Stored As Text
 * Detects text such as "1,200" or "$60" sitting in a column of real numbers.
 * Formulas ignore these cells (SUM skips them, comparisons fail), so totals
 * come out wrong with no error shown.
 *
 * Reported once per block of cells, listing every text number in it. There is
 * no automatic fix: the fix would write a value over an occupied cell.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, colToLetter, splitIntoBlocks } from '../utils'

/** Real numbers a block needs before it counts as a numeric column. */
const MIN_REAL_NUMBERS = 3
/** Most cells listed on one finding. */
const MAX_LISTED = 50
/** Optional sign/parentheses/currency/percent around digits, with optional thousands separators. */
const NUMBER_TEXT_RE = /^\(?[-+]?[$€£¥]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*%?\)?$/

/** Whether `text` is a number written as text. Identifiers (leading zero, 13+ digits) are not. */
export function looksLikeNumber(text: string): boolean {
  const t = text.trim()
  if (!NUMBER_TEXT_RE.test(t)) return false
  const digits = t.replace(/[^\d.]/g, '')
  if (/^0\d/.test(digits)) return false // zip codes, codes: 02134
  return digits.replace('.', '').length <= 12 // card numbers, long ids
}

export const numbersAsTextRule: AuditRule = {
  id: 'numbers-as-text',
  name: 'Numbers Stored As Text',
  description: 'Detects numbers typed as text in a column of numbers',
  defaultSeverity: 'medium',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (let col = 0; col <= ctx.maxCol; col++) {
      for (const block of splitIntoBlocks(ctx.getColumn(col), 'column')) {
        const real = block.filter((c) => c.type === 'number').length
        if (real < MIN_REAL_NUMBERS) continue

        const texty: CellInfo[] = block
          .filter((c) => c.type === 'string' && typeof c.rawValue === 'string' && looksLikeNumber(c.rawValue))
          .sort((a, b) => a.row - b.row)
        // A column that is mostly text with a few numbers is a label column, not a numeric one.
        if (texty.length === 0 || texty.length > real) continue

        const listed = texty.slice(0, MAX_LISTED)
        const names = listed.map((c) => c.cellId).join(', ')
        findings.push({
          id: findingId(),
          ruleId: 'numbers-as-text',
          severity: 'medium',
          title: `${texty.length} number${texty.length > 1 ? 's' : ''} stored as text in column ${colToLetter(col)}`,
          message: `${names}${texty.length > listed.length ? ', …' : ''} ${texty.length > 1 ? 'hold' : 'holds'} text that looks like a number, in a column of ${real} real numbers. SUM, AVERAGE and comparisons skip text, so totals can be too low.`,
          cells: listed.map((c) => ({ cellId: c.cellId, row: c.row, col: c.col })),
          suggestion: 'Retype each value as a number (remove the quote mark, currency sign or spaces), or re-import the column as numbers',
          autoFixable: false,
        })
      }
    }

    return findings
  },
}
