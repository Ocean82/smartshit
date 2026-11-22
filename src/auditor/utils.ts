/**
 * Spreadsheet Auditor — Utility functions.
 */

import { colToLetter, letterToCol, cellToRef, refToCell } from '@/engine/spreadsheet'
import type { AuditFinding, CellInfo } from './types'
import { extractFormulaRefs, refIsOnSheet } from '@/lib/formulaRefs'

export { colToLetter, letterToCol, cellToRef, refToCell }

/**
 * Placeholder id for a new finding. `runAudit` replaces it with a stable id
 * (see `stableFindingId`) once every rule has run.
 */
export function findingId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Same finding, same id on every run (FNV-1a of its key). `taken` keeps ids
 * unique inside one audit when two findings share a key.
 */
export function stableFindingId(key: string, taken: Set<string>): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const base = (hash >>> 0).toString(36)
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  taken.add(id)
  return id
}

/**
 * Stable identity of a finding across audit runs (finding ids are random per
 * run): the sheet, the rule, and the cells it points at.
 */
export function findingKey(sheetId: string, finding: Pick<AuditFinding, 'ruleId' | 'cells'>): string {
  return `${sheetId}|${finding.ruleId}|${finding.cells.map((c) => c.cellId).sort().join(',')}`
}

/** What a dismissal remembers about a cell: its formula, or else its value. */
export function cellSignature(cell: { value: unknown; formula?: string | null } | undefined): string {
  if (!cell) return ''
  if (cell.formula) return cell.formula.startsWith('=') ? cell.formula : `=${cell.formula}`
  return cell.value == null ? '' : String(cell.value)
}

/** Findings that reference `cellId`, preserving the audit's severity order. */
export function findingsForCell(findings: AuditFinding[], cellId: string): AuditFinding[] {
  return findings.filter((finding) => finding.cells.some((cell) => cell.cellId === cellId))
}

const ERROR_VALUE_RE = /^(#(?:REF|VALUE|DIV\/0|NAME\?|NULL|N\/A|NUM|CIRC|SPILL|CALC)!?)$/i

/** Check if a computed value represents a formula error. */
export function isErrorValue(value: string): boolean {
  return ERROR_VALUE_RE.test(value)
}

/** Extract the error type (e.g., "#REF!") from a computed value. */
export function getErrorType(value: string): string | undefined {
  const match = value.match(ERROR_VALUE_RE)
  return match ? match[1].toUpperCase() : undefined
}

/** Classify a cell's type based on its data. */
export function classifyCellType(
  rawValue: string | number | boolean | null,
  formula: string | null,
  computedValue: string,
): CellInfo['type'] {
  if (formula) return 'formula'
  if (isErrorValue(computedValue)) return 'error'
  if (rawValue === null || rawValue === undefined || rawValue === '') return 'empty'
  if (typeof rawValue === 'number') return 'number'
  if (typeof rawValue === 'boolean') return 'boolean'
  return 'string'
}

/** Formula-cell rows per column, sorted ascending. */
export type FormulaCellIndex = Map<number, number[]>

export function buildFormulaCellIndex(formulaCells: CellInfo[]): FormulaCellIndex {
  const index: FormulaCellIndex = new Map()
  for (const cell of formulaCells) {
    const rows = index.get(cell.col)
    if (rows) rows.push(cell.row)
    else index.set(cell.col, [cell.row])
  }
  for (const rows of index.values()) rows.sort((a, b) => a - b)
  return index
}

/**
 * Caps total dependency edges a rule materializes. Running totals over another
 * formula column (SUM($C$2:C2) filled down) grow quadratically.
 */
export const MAX_REFERENCE_EDGES = 200_000

/**
 * Formula cells on this sheet that `formula` references, including cells inside
 * ranges and `$`/sheet-qualified refs. Uses the index instead of expanding
 * ranges, so ranges over plain data cost nothing. Stops after `maxCells`.
 */
export function referencedFormulaCells(
  formula: string,
  sheetName: string,
  index: FormulaCellIndex,
  maxCells = Infinity,
): string[] {
  const out = new Set<string>()
  for (const ref of extractFormulaRefs(formula)) {
    if (out.size >= maxCells) break
    if (!refIsOnSheet(ref, sheetName)) continue
    const width = ref.endCol - ref.startCol + 1
    const cols = width <= index.size
      ? Array.from({ length: width }, (_, i) => ref.startCol + i)
      : [...index.keys()].filter((c) => c >= ref.startCol && c <= ref.endCol)
    for (const col of cols) {
      const rows = index.get(col)
      if (!rows) continue
      for (let i = lowerBound(rows, ref.startRow); i < rows.length && rows[i] <= ref.endRow; i++) {
        if (out.size >= maxCells) break
        out.add(refToCell(rows[i], col))
      }
    }
  }
  return [...out]
}

function lowerBound(sorted: number[], target: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Unqualified, relative range references (e.g., "A1:A10") from a formula.
 * Absolute and other-sheet ranges are skipped: range-gap fixes rewrite the
 * range text and checks look at the current sheet.
 */
export function extractRangeRefs(formula: string): Array<{ range: string; start: string; end: string }> {
  return extractFormulaRefs(formula)
    .filter((ref) => ref.sheet === null && /^[A-Z]+\d+:[A-Z]+\d+$/i.test(ref.text))
    .map((ref) => {
      const [start, end] = ref.text.toUpperCase().split(':')
      return { range: ref.text, start, end }
    })
}

/**
 * Normalize a formula for pattern comparison.
 * Replaces cell refs with relative offsets from the cell's position,
 * EXCEPT for references that only vary in the same axis as the cell's
 * direction (column offset stays constant = same-column ref = relative;
 * row offset stays constant across group = likely a constant/absolute ref).
 *
 * Heuristic: if a reference's column matches the formula's own column offset
 * (within the same row or a fixed row), it gets relative treatment.
 * References to the SAME absolute cell across the group (like $G$1 or a
 * header row) are detected by the caller via a two-pass approach.
 *
 * Simple approach: Normalize same-row refs as relative, but refs pointing to
 * row 0 (headers) or a row far away from the formula are marked as absolute.
 */
export function normalizeFormula(formula: string, row: number, col: number): string {
  // String literals pass through untouched, and a ref must not touch identifier
  // characters or be a function call, so LOG10(, ATAN2( and "Q2" are not cells.
  return formula.replace(/("(?:[^"]|"")*")|(?<![A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d{1,5})(?![A-Za-z0-9_.(])/g, (match, literal: string | undefined, colAbs: string, colStr: string, rowAbs: string, rowStr: string) => {
    if (literal !== undefined) return match
    const refCol = letterToCol(colStr)
    const refRow = parseInt(rowStr, 10) - 1

    // If either axis is explicitly absolute ($A$1 or $A1 or A$1), preserve as-is
    if (colAbs === '$' || rowAbs === '$') {
      return `ABS[${colStr}${rowStr}]`
    }

    // Heuristic: if the reference points to row 0 (header row) or the same fixed
    // cell regardless of formula position (row offset > 3 rows away), treat as constant
    if (refRow === 0 && row > 0) {
      return `ABS[${colStr}${rowStr}]`
    }

    return `R[${refRow - row}]C[${refCol - col}]`
  })
}

/**
 * Replace the first unqualified occurrence of `range` (as returned by
 * extractRangeRefs) with `replacement`. Positional, so the same text inside a
 * sheet-qualified ref ("Other!A2:A3") or a string literal is never touched.
 */
export function replaceRangeRef(formula: string, range: string, replacement: string): string {
  const ref = extractFormulaRefs(formula).find((r) => r.sheet === null && r.text === range)
  if (!ref) return formula
  return formula.slice(0, ref.textStart) + replacement + formula.slice(ref.textStart + range.length)
}

/** Check if a cell looks like a summary/total row (heuristic). */
export function isSummaryCell(cellInfo: CellInfo, allCellsInCol: CellInfo[]): boolean {
  if (!cellInfo.formula) return false

  // If it's the last formula in its column, it's likely a summary
  const isLastFormulaInCol = !allCellsInCol.some((c) => c.formula && c.row > cellInfo.row)
  if (isLastFormulaInCol) return true

  // If the formula references a range within the same column (SUM, AVERAGE, etc.)
  const aggregatePattern = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|SUBTOTAL)\b/i
  return aggregatePattern.test(cellInfo.formula)
}
