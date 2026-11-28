/**
 * Rule: Orphaned Inputs
 * Detects a standalone number (usually a labelled assumption such as a rate)
 * that no formula reads. Either the model forgot to use it, or a formula
 * hardcodes the same number instead, so changing the input changes nothing.
 *
 * Deliberately narrow, to keep noise down:
 * - only on sheets that look like a model (three or more formulas);
 * - only numbers with no number or formula directly above, below, left or
 *   right (cells inside a data table are never inputs);
 * - needs workbook context, because another sheet may be the reader;
 * - many hits are collapsed into one summary finding.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId } from '../utils'
import { extractFormulaRefs, refContains, refIsOnSheet, type FormulaRef } from '@/lib/formulaRefs'

const MIN_FORMULAS = 3
/** Above this many orphans the rule reports one summary instead of one finding each. */
const MAX_INDIVIDUAL = 5
const MAX_SUMMARY_CELLS = 100

const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const

export const orphanedInputsRule: AuditRule = {
  id: 'orphaned-inputs',
  name: 'Orphaned Inputs',
  description: 'Detects standalone input numbers that no formula reads',
  defaultSeverity: 'info',

  run(ctx: AuditContext): AuditFinding[] {
    if (!ctx.workbook || ctx.formulaCells.length < MIN_FORMULAS) return []

    // Every reference that reads this sheet: its own formulas plus other sheets' formulas that name it.
    const readers: FormulaRef[] = []
    for (const cell of ctx.formulaCells) {
      if (cell.formula) readers.push(...extractFormulaRefs(cell.formula).filter((r) => refIsOnSheet(r, ctx.sheetName)))
    }
    const ownName = ctx.sheetName.toLowerCase()
    for (const other of ctx.workbook.sheets) {
      if (other.name.toLowerCase() === ownName) continue
      for (const cell of Object.values(other.cells)) {
        if (!cell.formula) continue
        readers.push(...extractFormulaRefs(cell.formula).filter((r) => r.sheet?.toLowerCase() === ownName))
      }
    }

    const isRead = (c: CellInfo) => readers.some((ref) => refContains(ref, c.row, c.col))
    const inTable = (c: CellInfo) =>
      NEIGHBOURS.some(([dr, dc]) => {
        const n = ctx.getCellAt(c.row + dr, c.col + dc)
        return n !== null && (n.type === 'number' || n.type === 'formula')
      })

    const orphans = ctx.allCells
      .filter((c) => c.type === 'number' && !inTable(c) && !isRead(c))
      .sort((a, b) => a.row - b.row || a.col - b.col)
    if (orphans.length === 0) return []

    const loc = (c: CellInfo) => ({ cellId: c.cellId, row: c.row, col: c.col })
    const suggestion = 'Use the input in the formulas it should drive, or remove it if it is leftover'

    if (orphans.length > MAX_INDIVIDUAL) {
      return [{
        id: findingId(),
        ruleId: 'orphaned-inputs',
        severity: 'info',
        title: `${orphans.length} input numbers are not used by any formula`,
        message: `${orphans.length} standalone numbers on this sheet are not read by any formula here or on another sheet. If they are assumptions, the model may not depend on them.`,
        cells: orphans.slice(0, MAX_SUMMARY_CELLS).map(loc),
        suggestion,
        autoFixable: false,
      }]
    }

    return orphans.map((c) => ({
      id: findingId(),
      ruleId: 'orphaned-inputs',
      severity: 'info' as const,
      title: `Input ${c.cellId} is not used by any formula`,
      message: `${c.cellId} holds ${c.rawValue} but no formula on this workbook reads it. If it is an assumption, changing it will not change any result.`,
      cells: [loc(c)],
      suggestion,
      autoFixable: false,
    }))
  },
}
