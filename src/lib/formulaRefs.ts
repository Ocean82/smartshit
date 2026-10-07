import { letterToCol, refToCell } from './cellRef'

/** One A1 reference or range in a formula, 0-based and normalized (start <= end). */
export interface FormulaRef {
  /** Sheet prefix as written (unquoted), or null for an unqualified reference. */
  sheet: string | null
  /** The reference as written, without the sheet prefix (e.g. "$A$1:B5"). */
  text: string
  isRange: boolean
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

const MAX_ROW = 1_048_575
const MAX_COL = 16_383
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?\d{1,7}`
const COL = String.raw`\$?[A-Za-z]{1,3}`
const ROW = String.raw`\$?\d{1,7}`
// String literals are matched first so their contents are skipped. A ref must
// not touch identifier characters (LOG10, Rate2024) or be a function call.
const REF_RE = new RegExp(
  String.raw`("(?:[^"]|"")*")` +
    String.raw`|(?<![A-Za-z0-9_.$])(?:'((?:[^']|'')+)'!|([A-Za-z_][A-Za-z0-9_.]*)!)?` +
    `(?:(${CELL})(?::(${CELL}))?|(${COL}):(${COL})|(${ROW}):(${ROW}))(?![A-Za-z0-9_.(])`,
  'g',
)

function parseCol(text: string): number {
  return letterToCol(text.replace(/\$/g, '').toUpperCase())
}

function parseRow(text: string): number {
  return parseInt(text.replace(/\$/g, ''), 10) - 1
}

function parseCell(text: string): { row: number; col: number } {
  const m = text.replace(/\$/g, '').match(/^([A-Za-z]{1,3})(\d{1,7})$/)!
  return { row: parseInt(m[2], 10) - 1, col: letterToCol(m[1].toUpperCase()) }
}

/** All cell and range references in a formula, including `$` and sheet-qualified ones. */
export function extractFormulaRefs(formula: string): FormulaRef[] {
  const refs: FormulaRef[] = []
  for (const m of formula.matchAll(REF_RE)) {
    if (m[1] != null) continue
    const sheet = m[2] != null ? m[2].replace(/''/g, "'") : (m[3] ?? null)
    let a: { row: number; col: number }
    let b: { row: number; col: number }
    let text: string
    if (m[4]) {
      a = parseCell(m[4])
      b = m[5] ? parseCell(m[5]) : a
      text = m[5] ? `${m[4]}:${m[5]}` : m[4]
    } else if (m[6]) {
      a = { row: 0, col: parseCol(m[6]) }
      b = { row: MAX_ROW, col: parseCol(m[7]) }
      text = `${m[6]}:${m[7]}`
    } else {
      a = { row: parseRow(m[8]), col: 0 }
      b = { row: parseRow(m[9]), col: MAX_COL }
      text = `${m[8]}:${m[9]}`
    }
    if (a.row < 0 || b.row < 0) continue
    refs.push({
      sheet,
      text,
      isRange: text.includes(':'),
      startRow: Math.min(a.row, b.row),
      startCol: Math.min(a.col, b.col),
      endRow: Math.max(a.row, b.row),
      endCol: Math.max(a.col, b.col),
    })
  }
  return refs
}

/** Whether a reference points at the given sheet (unqualified refs mean the formula's own sheet). */
export function refIsOnSheet(ref: FormulaRef, sheetName: string): boolean {
  return ref.sheet === null || ref.sheet.toLowerCase() === sheetName.toLowerCase()
}

export function refContains(ref: FormulaRef, row: number, col: number): boolean {
  return row >= ref.startRow && row <= ref.endRow && col >= ref.startCol && col <= ref.endCol
}

export interface CellFormulaRefs {
  cellId: string
  refs: FormulaRef[]
}

/** Parse every formula on a sheet once, for repeated dependent lookups. */
export function collectSheetFormulaRefs(cells: Record<string, { formula?: string | null }>): CellFormulaRefs[] {
  const out: CellFormulaRefs[] = []
  for (const [cellId, cell] of Object.entries(cells)) {
    if (cell.formula) out.push({ cellId, refs: extractFormulaRefs(cell.formula) })
  }
  return out
}

/** Cells whose formulas reference (row, col) on `sheetName`, directly or through a range. */
export function findDependents(
  sheetRefs: CellFormulaRefs[],
  sheetName: string,
  row: number,
  col: number,
): string[] {
  const self = refToCell(row, col)
  return sheetRefs
    .filter(({ cellId, refs }) =>
      cellId !== self && refs.some((ref) => refIsOnSheet(ref, sheetName) && refContains(ref, row, col)))
    .map(({ cellId }) => cellId)
}

/** Same-sheet cells a formula reads, with ranges expanded up to `limit` cells. */
export function listPrecedents(formula: string, sheetName: string, limit: number): string[] {
  const out = new Set<string>()
  for (const ref of extractFormulaRefs(formula)) {
    if (!refIsOnSheet(ref, sheetName)) continue
    for (let r = ref.startRow; r <= ref.endRow; r++) {
      for (let c = ref.startCol; c <= ref.endCol; c++) {
        if (out.size >= limit) return [...out]
        out.add(refToCell(r, c))
      }
    }
  }
  return [...out]
}
