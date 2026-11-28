/**
 * Rule: Range Gaps
 * Detects SUM/AVERAGE/COUNT/MIN/MAX ranges that skip data next to them. This
 * catches off-by-one errors where a total formula excludes a data row.
 *
 * - Every edge of the range is checked (one- and two-dimensional ranges).
 * - Neighbours that are numbers or item formulas count as data. Totals (other
 *   aggregates) and cells that read the formula cell do not.
 * - A single empty row or column between the range and the data is looked
 *   across, except when that data already belongs to another aggregate, which
 *   usually means a separate section.
 * - Only a plain-number neighbour directly next to the range gets an automatic
 *   fix. Anything else (item formulas, data past a gap) is reported only.
 */

import type { AuditRule, AuditFinding, AuditContext, CellInfo } from '../types'
import { findingId, refToCell } from '../utils'
import { extractFormulaRefs, refContains, refIsOnSheet } from '@/lib/formulaRefs'

const AGGREGATE_FUNCTIONS = new Set(['SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MIN', 'MAX', 'SUBTOTAL'])
const AGGREGATE_PATTERN = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|SUBTOTAL)\b/i
/** Most neighbouring cells listed on one finding. */
const MAX_LISTED_NEIGHBOURS = 25

type Side = 'above' | 'below' | 'left' | 'right'
const SIDES: Side[] = ['above', 'below', 'left', 'right']

interface Bounds { minRow: number; maxRow: number; minCol: number; maxCol: number }

/** The cells on one side of a range, `distance` rows/columns away from it. */
function linePositions(side: Side, b: Bounds, distance: number): Array<{ row: number; col: number }> {
  const out: Array<{ row: number; col: number }> = []
  if (side === 'above' || side === 'below') {
    const row = side === 'above' ? b.minRow - distance : b.maxRow + distance
    if (row < 0) return out
    for (let col = b.minCol; col <= b.maxCol; col++) out.push({ row, col })
  } else {
    const col = side === 'left' ? b.minCol - distance : b.maxCol + distance
    if (col < 0) return out
    for (let row = b.minRow; row <= b.maxRow; row++) out.push({ row, col })
  }
  return out
}

function extend(side: Side, b: Bounds, distance: number): Bounds {
  switch (side) {
    case 'above': return { ...b, minRow: b.minRow - distance }
    case 'below': return { ...b, maxRow: b.maxRow + distance }
    case 'left': return { ...b, minCol: b.minCol - distance }
    case 'right': return { ...b, maxCol: b.maxCol + distance }
  }
}

/** Name of the innermost function whose argument list contains `index`, or null. */
function enclosingFunction(formula: string, index: number): string | null {
  const masked = formula.replace(/"(?:[^"]|"")*"/g, (s) => ' '.repeat(s.length))
  let depth = 0
  for (let i = index - 1; i >= 0; i--) {
    if (masked[i] === ')') depth++
    else if (masked[i] === '(') {
      if (depth === 0) return masked.slice(0, i).match(/([A-Za-z_][A-Za-z0-9_.]*)$/)?.[1].toUpperCase() ?? null
      depth--
    }
  }
  return null
}

export const rangeGapsRule: AuditRule = {
  id: 'range-gaps',
  name: 'Range Gaps',
  description: 'Detects aggregate formulas that skip adjacent non-empty cells',
  defaultSeverity: 'high',

  run(ctx: AuditContext): AuditFinding[] {
    const findings: AuditFinding[] = []

    // Every aggregate range on the sheet, to recognise data that another total already covers.
    const aggregateRanges: Array<{ owner: string; bounds: Bounds }> = []
    const perCell = new Map<string, Array<{ range: string; textStart: number; bounds: Bounds }>>()
    for (const cell of ctx.formulaCells) {
      if (!cell.formula || !AGGREGATE_PATTERN.test(cell.formula)) continue
      const ranges: Array<{ range: string; textStart: number; bounds: Bounds }> = []
      for (const ref of extractFormulaRefs(cell.formula)) {
        // Same-sheet, relative, bounded A1:B2 ranges only; the fix rewrites that text in place.
        if (ref.sheet !== null || !/^[A-Z]+\d+:[A-Z]+\d+$/i.test(ref.text)) continue
        if (!AGGREGATE_FUNCTIONS.has(enclosingFunction(cell.formula, ref.textStart) ?? '')) continue
        const range = ref.text
        const textStart = ref.textStart
        const bounds = { minRow: ref.startRow, maxRow: ref.endRow, minCol: ref.startCol, maxCol: ref.endCol }
        ranges.push({ range, textStart, bounds })
        aggregateRanges.push({ owner: cell.cellId, bounds })
      }
      if (ranges.length > 0) perCell.set(cell.cellId, ranges)
    }

    const coveredByOther = (owner: string, row: number, col: number) =>
      aggregateRanges.some((r) =>
        r.owner !== owner && row >= r.bounds.minRow && row <= r.bounds.maxRow && col >= r.bounds.minCol && col <= r.bounds.maxCol)

    /** Whether `neighbour` is data the formula cell should plausibly include. */
    const isData = (neighbour: CellInfo | null, formulaCell: CellInfo): neighbour is CellInfo => {
      if (!neighbour || neighbour.cellId === formulaCell.cellId) return false
      if (neighbour.type === 'number') return true
      if (neighbour.type !== 'formula' || !neighbour.formula) return false
      if (AGGREGATE_PATTERN.test(neighbour.formula)) return false // a total, not an item
      if (neighbour.computedValue.trim() === '' || !Number.isFinite(Number(neighbour.computedValue))) return false
      // A cell that reads the formula cell would create a cycle if included.
      return !extractFormulaRefs(neighbour.formula).some(
        (ref) => refIsOnSheet(ref, ctx.sheetName) && refContains(ref, formulaCell.row, formulaCell.col),
      )
    }

    for (const cell of ctx.formulaCells) {
      const ranges = perCell.get(cell.cellId)
      if (!cell.formula || !ranges) continue

      for (const { range, textStart, bounds } of ranges) {
        for (const side of SIDES) {
          const near = linePositions(side, bounds, 1)
          if (near.length === 0) continue
          const nearCells = near.map((p) => ctx.getCellAt(p.row, p.col))

          let distance = 0
          let neighbours: CellInfo[] = []
          if (nearCells.every((c) => isData(c, cell))) {
            distance = 1
            neighbours = nearCells as CellInfo[]
          } else if (nearCells.every((c) => c === null)) {
            // Empty line next to the range: look across it (a gap of one).
            const far = linePositions(side, bounds, 2)
            const farCells = far.map((p) => ctx.getCellAt(p.row, p.col))
            if (far.length > 0 && farCells.every((c) => isData(c, cell)) &&
              !far.some((p) => coveredByOther(cell.cellId, p.row, p.col))) {
              distance = 2
              neighbours = farCells as CellInfo[]
            }
          }
          if (distance === 0) continue

          const newBounds = extend(side, bounds, distance)
          const newRange = `${refToCell(newBounds.minRow, newBounds.minCol)}:${refToCell(newBounds.maxRow, newBounds.maxCol)}`
          const onlyNumbers = distance === 1 && neighbours.every((n) => n.type === 'number')
          const first = neighbours[0]
          const listed = neighbours.slice(0, MAX_LISTED_NEIGHBOURS)
          const where = distance === 1
            ? 'immediately adjacent and excluded'
            : `separated from the range by one empty ${side === 'above' || side === 'below' ? 'row' : 'column'} and excluded`
          const what = neighbours.length === 1
            ? `${first.cellId} (value: ${first.type === 'number' ? first.rawValue : first.computedValue}) is`
            : `${first.cellId} to ${neighbours[neighbours.length - 1].cellId} are`

          findings.push({
            id: findingId(),
            ruleId: 'range-gaps',
            severity: 'high',
            title: `Range may exclude adjacent data in ${cell.cellId}`,
            message: `${cell.cellId} uses ${range} but ${what} ${where}. Formula: =${cell.formula}`,
            cells: [
              { cellId: cell.cellId, row: cell.row, col: cell.col },
              ...listed.map((n) => ({ cellId: n.cellId, row: n.row, col: n.col })),
            ],
            suggestion: `Extend range to ${newRange}, or confirm those cells are meant to be left out`,
            autoFixable: onlyNumbers,
            fixActions: onlyNumbers
              ? [{
                  cellId: cell.cellId,
                  formula: `=${cell.formula.slice(0, textStart)}${newRange}${cell.formula.slice(textStart + range.length)}`,
                }]
              : undefined,
          })
        }
      }
    }

    return findings
  },
}
