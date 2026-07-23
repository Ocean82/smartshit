/**
 * Rule: Range Gaps
 * Detects SUM/AVERAGE/COUNT ranges that skip adjacent non-empty numeric cells.
 * This catches off-by-one errors where a total formula excludes a data row.
 */

import type { AuditRule, AuditFinding, AuditContext } from '../types'
import { findingId, extractRangeRefs, cellToRef, refToCell } from '../utils'

const AGGREGATE_PATTERN = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|SUBTOTAL)\b/i

export const rangeGapsRule: AuditRule = {
  id: 'range-gaps',
  name: 'Range Gaps',
  description: 'Detects aggregate formulas that skip adjacent non-empty cells',
  defaultSeverity: 'high',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    for (const cell of ctx.formulaCells) {
      if (!cell.formula || !AGGREGATE_PATTERN.test(cell.formula)) continue

      const ranges = extractRangeRefs(cell.formula)

      for (const { range, start, end } of ranges) {
        const startRef = cellToRef(start)
        const endRef = cellToRef(end)

        // Only check single-column or single-row ranges
        if (startRef.col === endRef.col) {
          // Vertical range — check above and below
          const col = startRef.col
          const minRow = Math.min(startRef.row, endRef.row)
          const maxRow = Math.max(startRef.row, endRef.row)

          // Check cell immediately above range
          if (minRow > 0) {
            const above = ctx.getCellAt(minRow - 1, col)
            if (above && above.type === 'number' && above.row !== cell.row) {
              const extendedStart = refToCell(minRow - 1, col)
              findings.push({
                id: findingId(),
                ruleId: 'range-gaps',
                severity: 'high',
                title: `Range may exclude adjacent data in ${cell.cellId}`,
                message: `${cell.cellId} uses ${range} but ${above.cellId} (value: ${above.rawValue}) is immediately adjacent and excluded. Formula: =${cell.formula}`,
                cells: [
                  { cellId: cell.cellId, row: cell.row, col: cell.col },
                  { cellId: above.cellId, row: above.row, col: above.col },
                ],
                suggestion: `Extend range to ${extendedStart}:${end}`,
                autoFixable: true,
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula!.replace(range, `${extendedStart}:${end}`)}`,
                },
              })
            }
          }

          // Check cell immediately below range (but not the formula cell itself)
          if (maxRow < ctx.maxRow) {
            const below = ctx.getCellAt(maxRow + 1, col)
            if (below && below.type === 'number' && below.row !== cell.row) {
              const extendedEnd = refToCell(maxRow + 1, col)
              findings.push({
                id: findingId(),
                ruleId: 'range-gaps',
                severity: 'high',
                title: `Range may exclude adjacent data in ${cell.cellId}`,
                message: `${cell.cellId} uses ${range} but ${below.cellId} (value: ${below.rawValue}) is immediately adjacent and excluded. Formula: =${cell.formula}`,
                cells: [
                  { cellId: cell.cellId, row: cell.row, col: cell.col },
                  { cellId: below.cellId, row: below.row, col: below.col },
                ],
                suggestion: `Extend range to ${start}:${extendedEnd}`,
                autoFixable: true,
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula!.replace(range, `${start}:${extendedEnd}`)}`,
                },
              })
            }
          }
        }

        if (startRef.row === endRef.row) {
          // Horizontal range — check left and right
          const row = startRef.row
          const minCol = Math.min(startRef.col, endRef.col)
          const maxCol = Math.max(startRef.col, endRef.col)

          if (minCol > 0) {
            const left = ctx.getCellAt(row, minCol - 1)
            if (left && left.type === 'number' && left.col !== cell.col) {
              const extendedStart = refToCell(row, minCol - 1)
              findings.push({
                id: findingId(),
                ruleId: 'range-gaps',
                severity: 'high',
                title: `Range may exclude adjacent data in ${cell.cellId}`,
                message: `${cell.cellId} uses ${range} but ${left.cellId} (value: ${left.rawValue}) is immediately adjacent and excluded.`,
                cells: [
                  { cellId: cell.cellId, row: cell.row, col: cell.col },
                  { cellId: left.cellId, row: left.row, col: left.col },
                ],
                suggestion: `Extend range to ${extendedStart}:${end}`,
                autoFixable: true,
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula.replace(range, `${extendedStart}:${end}`)}`,
                },
              })
            }
          }

          if (maxCol < ctx.maxCol) {
            const right = ctx.getCellAt(row, maxCol + 1)
            if (right && right.type === 'number' && right.col !== cell.col) {
              const extendedEnd = refToCell(row, maxCol + 1)
              findings.push({
                id: findingId(),
                ruleId: 'range-gaps',
                severity: 'high',
                title: `Range may exclude adjacent data in ${cell.cellId}`,
                message: `${cell.cellId} uses ${range} but ${right.cellId} (value: ${right.rawValue}) is immediately adjacent and excluded.`,
                cells: [
                  { cellId: cell.cellId, row: cell.row, col: cell.col },
                  { cellId: right.cellId, row: right.row, col: right.col },
                ],
                suggestion: `Extend range to ${start}:${extendedEnd}`,
                autoFixable: true,
                fixAction: {
                  cellId: cell.cellId,
                  formula: `=${cell.formula.replace(range, `${start}:${extendedEnd}`)}`,
                },
              })
            }
          }
        }
      }
    }

    return findings
  },
}
