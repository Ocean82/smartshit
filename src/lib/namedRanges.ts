/**
 * Named-range helpers — validation + formula expansion.
 * ponytail: expand to A1 before Formualizer (no define-name API in engine 0.8.5).
 */
import { tryCellToRef, colToLetter } from '@/lib/cellRef'
import type { NamedRange, Selection, SheetData } from '@/types'

const NAME_RE = /^[A-Za-z_][A-Za-z0-9._]*$/
const RESERVED = new Set(['TRUE', 'FALSE', 'NULL'])

export function isValidNamedRangeName(name: string): boolean {
  const t = name.trim()
  if (!t || t.length > 255) return false
  if (!NAME_RE.test(t)) return false
  if (RESERVED.has(t.toUpperCase())) return false
  if (tryCellToRef(t)) return false
  return true
}

/** Absolute A1 range text from a selection (0-based). */
export function selectionToAbsRange(sel: Selection): string {
  const r0 = Math.min(sel.startRow, sel.endRow)
  const r1 = Math.max(sel.startRow, sel.endRow)
  const c0 = Math.min(sel.startCol, sel.endCol)
  const c1 = Math.max(sel.startCol, sel.endCol)
  const a = `$${colToLetter(c0)}$${r0 + 1}`
  if (r0 === r1 && c0 === c1) return a
  return `${a}:$${colToLetter(c1)}$${r1 + 1}`
}

/** Normalize user range text; null if unusable. */
export function normalizeRangeText(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, '')
  if (!t) return null
  const m = t.match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?$/)
  if (!m) return null
  const a = `$${m[2].toUpperCase()}$${parseInt(m[4], 10)}`
  if (!m[6]) return a
  return `${a}:$${m[6].toUpperCase()}$${parseInt(m[8], 10)}`
}

function quoteSheetName(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9._]*$/.test(name)) return name
  return `'${name.replace(/'/g, "''")}'`
}

/** Sheet-qualified absolute ref for engine, e.g. Sheet1!$B$2:$B$10.
 * When `currentSheetId` matches the named range sheet, omit the sheet prefix
 * (Formualizer sheet-local refs are more reliable than `Sheet!Range`).
 */
export function namedRangeToEngineRef(
  nr: NamedRange,
  sheets: Array<Pick<SheetData, 'id' | 'name'>>,
  currentSheetId?: string,
): string | null {
  const sheet = sheets.find((s) => s.id === nr.sheetId)
  const range = normalizeRangeText(nr.range)
  if (!sheet || !range) return null
  if (currentSheetId && nr.sheetId === currentSheetId) {
    // ponytail: Formualizer mishandles some Sheet!Abs refs; prefer relative A1 on-sheet.
    return range.replace(/\$/g, '')
  }
  return `${quoteSheetName(sheet.name)}!${range}`
}

/**
 * Replace whole-word named ranges in a formula with sheet-qualified refs.
 * Skips double-quoted strings. Longer names first.
 */
export function expandNamedRangesInFormula(
  formula: string,
  namedRanges: NamedRange[],
  sheets: Array<Pick<SheetData, 'id' | 'name'>>,
  currentSheetId?: string,
): string {
  if (!formula.startsWith('=') || namedRanges.length === 0) return formula

  const byUpper = new Map<string, string>()
  for (const nr of namedRanges) {
    const ref = namedRangeToEngineRef(nr, sheets, currentSheetId)
    if (ref) byUpper.set(nr.name.toUpperCase(), ref)
  }
  if (byUpper.size === 0) return formula

  const names = [...byUpper.keys()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(
    `("([^"]|"")*")|\\b(${names.map(escapeRegExp).join('|')})\\b`,
    'gi',
  )

  return formula.replace(pattern, (match, strLit, _inner, nameHit) => {
    if (strLit != null) return strLit
    const ref = byUpper.get(String(nameHit).toUpperCase())
    return ref ?? match
  })
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findNamedRangeConflict(
  name: string,
  namedRanges: NamedRange[],
  excludeName?: string,
): NamedRange | undefined {
  const upper = name.trim().toUpperCase()
  const exclude = excludeName?.trim().toUpperCase()
  return namedRanges.find(
    (n) => n.name.toUpperCase() === upper && n.name.toUpperCase() !== exclude,
  )
}
