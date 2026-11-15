/**
 * Known formula-engine divergences surfaced at import time.
 *
 * SmartSht evaluates formulas with `@ocean8219/formualizer`, which has open
 * upstream issues for a handful of common Excel patterns (see
 * `docs/formualizer-gaps.md`). Imported files keep Excel's pre-computed values,
 * but once the workbook recalculates, these formulas can produce a different
 * result than Excel did.
 *
 * Every rule here was verified against the bundled engine in
 * `src/engine/knownGaps.realengine.test.ts`. Two upstream issues in the doc
 * (#319 MATCH-blank coercion and #285 COUNTBLANK sparse ranges) do **not**
 * reproduce on 0.9.3, so they are regression guards in that test instead of
 * warnings here — a warning about working formulas would only train users to
 * ignore the card.
 *
 * Deliberately conservative: these matchers only flag patterns that are
 * statically unambiguous. A missed warning is better than crying wolf.
 */

import type { SheetData } from '@/types'
import { refToCell } from '@/lib/cellRef'
import { extractFormulaRefs } from '@/lib/formulaRefs'

export type KnownEngineIssueRule = 'date-arithmetic' | 'approx-lookup' | 'wildcard-escape'

export interface KnownEngineIssue {
  rule: KnownEngineIssueRule
  /** Upstream formualizer issue URL. */
  upstreamIssue: string
  title: string
  message: string
  /** Cell ids (A1 notation) whose formula triggered the match. */
  cells: string[]
}

const UPSTREAM = 'https://github.com/psu3d0/formualizer/issues'

/** Excel functions that yield a date *type* in this engine (see #312). */
const DATE_FUNCTIONS = new Set(['DATE', 'TODAY', 'NOW', 'EDATE', 'EOMONTH', 'DATEVALUE'])

const CRITERIA_FUNCTIONS = new Set(['COUNTIF', 'SUMIF', 'COUNTIFS', 'SUMIFS', 'AVERAGEIF', 'AVERAGEIFS'])

interface Call {
  name: string
  args: string[]
  /** Index of the first character of the function name. */
  start: number
  /** Index of the closing parenthesis. */
  end: number
}

/** Split a function-call argument list on top-level commas, ignoring quoted text. */
function splitArgs(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let inQuote = false
  let current = ''
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote
    if (!inQuote) {
      if (ch === '(') depth++
      else if (ch === ')') depth = Math.max(0, depth - 1)
      else if (ch === ',' && depth === 0) {
        out.push(current.trim())
        current = ''
        continue
      }
    }
    current += ch
  }
  out.push(current.trim())
  return out
}

/**
 * Find every call to one of `names`, with balanced argument extraction.
 * A plain regex cannot do this: argument lists may contain nested calls or
 * commas inside string literals.
 */
function findCalls(formula: string, names: ReadonlySet<string>): Call[] {
  const calls: Call[] = []
  const upper = formula.toUpperCase()

  for (let i = 0; i < formula.length; i++) {
    if (!/[A-Za-z_]/.test(formula[i])) continue

    const nameStart = i
    let nameEnd = i
    while (nameEnd < formula.length && /[A-Za-z0-9_.]/.test(formula[nameEnd])) nameEnd++
    const name = upper.slice(nameStart, nameEnd)
    i = nameEnd - 1
    if (!names.has(name)) continue

    let open = nameEnd
    while (open < formula.length && /\s/.test(formula[open])) open++
    if (formula[open] !== '(') continue

    let depth = 0
    let inQuote = false
    let close = -1
    for (let p = open; p < formula.length; p++) {
      const ch = formula[p]
      if (ch === '"') inQuote = !inQuote
      if (inQuote) continue
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) {
          close = p
          break
        }
      }
    }
    if (close === -1) continue

    calls.push({ name, args: splitArgs(formula.slice(open + 1, close)), start: nameStart, end: close })
  }

  return calls
}

/** Replace quoted string literals with empty quotes so operators inside text are ignored. */
function stripStrings(formula: string): string {
  return formula.replace(/"(?:[^"]|"")*"/g, '""')
}

function isTrueOrMissing(arg: string | undefined): boolean {
  if (arg === undefined || arg === '') return true
  const normalized = arg.toUpperCase()
  return normalized === 'TRUE' || normalized === '1'
}

/** Is the call used as an operand of binary +/- (the operators that preserve Date)? */
function callInAdditiveContext(formula: string, call: Call): boolean {
  const before = formula.slice(0, call.start).trimEnd()
  const after = formula.slice(call.end + 1).trimStart()
  return /[+-]$/.test(before) || /^[+-]/.test(after)
}

/**
 * Cells whose *value* is a Date object rather than a serial number. `*` and `/`
 * coerce a Date to a number, so formulas containing them do not propagate the
 * type; `+` and `-` do.
 */
function dateProducingCells(sheet: SheetData): Set<string> {
  const producing = new Set<string>()

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (!cell.formula) continue
    if (stripStrings(cell.formula).includes('*')) continue
    if (findCalls(cell.formula, DATE_FUNCTIONS).length > 0) producing.add(cellId)
  }

  // Follow simple aliases (`=A1`) a few hops so `=DATE(...)` → `=A1` → `=B1+1`
  // is still caught.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const [cellId, cell] of Object.entries(sheet.cells)) {
      if (!cell.formula || producing.has(cellId)) continue
      if (stripStrings(cell.formula).includes('*')) continue
      const refs = extractFormulaRefs(cell.formula)
      if (refs.length !== 1) continue
      const ref = refs[0]
      if (ref.isRange || ref.sheet !== null) continue
      if (producing.has(refToCell(ref.startRow, ref.startCol))) {
        producing.add(cellId)
        changed = true
      }
    }
    if (!changed) break
  }

  return producing
}

/** Does the formula reference a date-producing cell as an operand of +/-? */
function referencesDateArithmetically(formula: string, dateCells: Set<string>): boolean {
  const refs = extractFormulaRefs(formula)
  if (refs.length === 0) return false
  const cleaned = stripStrings(formula)
  for (const ref of refs) {
    if (ref.isRange || ref.sheet !== null) continue
    if (!dateCells.has(refToCell(ref.startRow, ref.startCol))) continue
    const written = ref.text.replace(/[$]/g, '\\$')
    const pattern = new RegExp(
      `(?:[+-]\\s*${written}(?![A-Za-z0-9_.])|(?<![A-Za-z0-9_.])${written}\\s*[+-])`,
      'i',
    )
    if (pattern.test(cleaned)) return true
  }
  return false
}

const DETECTORS: Array<{
  rule: KnownEngineIssueRule
  upstreamIssue: string
  title: string
  message: string
  matches: (formula: string, dateCells: Set<string>) => boolean
}> = [
  {
    rule: 'date-arithmetic',
    upstreamIssue: `${UPSTREAM}/312`,
    title: 'Date arithmetic returns a date type',
    message:
      'Adding or subtracting from a date value yields a date type instead of Excel’s day serial number, which SmartSht renders as #ERROR!. Coerce first with VALUE(...) or *1, e.g. =VALUE(A1)+30.',
    matches: (formula, dateCells) => {
      if (!/[+-]/.test(stripStrings(formula))) return false
      const direct = findCalls(formula, DATE_FUNCTIONS).some((call) =>
        callInAdditiveContext(formula, call),
      )
      return direct || referencesDateArithmetically(formula, dateCells)
    },
  },
  {
    rule: 'approx-lookup',
    upstreamIssue: `${UPSTREAM}/283`,
    title: 'Approximate-mode lookup',
    message:
      'Approximate VLOOKUP/HLOOKUP/MATCH assumes sorted data and can return #N/A or a wrong row on unsorted data. Pass FALSE (or 0) as the last argument for an exact match.',
    matches: (formula) => {
      const calls = findCalls(formula, new Set(['VLOOKUP', 'HLOOKUP', 'MATCH']))
      return calls.some((call) =>
        call.name === 'MATCH' ? isTrueOrMissing(call.args[2]) : isTrueOrMissing(call.args[3]),
      )
    },
  },
  {
    rule: 'wildcard-escape',
    upstreamIssue: `${UPSTREAM}/295`,
    title: 'Wildcard escapes in criteria',
    message:
      'Criteria containing ~, _ or % do not match Excel: ~ escapes are dropped and _ / % are treated as SQL-style wildcards. Excel’s * and ? wildcards do work.',
    matches: (formula) =>
      findCalls(formula, CRITERIA_FUNCTIONS).some((call) =>
        call.args.some((arg) => /^".*[~_%].*"$/.test(arg)),
      ),
  },
]

/** Detect formulas in a sheet that use a pattern with a known engine divergence. */
export function detectKnownEngineIssues(sheet: SheetData): KnownEngineIssue[] {
  const dateCells = dateProducingCells(sheet)
  const byRule = new Map<KnownEngineIssueRule, KnownEngineIssue>()

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (!cell.formula) continue
    const formula = cell.formula
    for (const detector of DETECTORS) {
      if (!detector.matches(formula, dateCells)) continue
      const existing = byRule.get(detector.rule)
      if (existing) {
        existing.cells.push(cellId)
      } else {
        byRule.set(detector.rule, {
          rule: detector.rule,
          upstreamIssue: detector.upstreamIssue,
          title: detector.title,
          message: detector.message,
          cells: [cellId],
        })
      }
    }
  }

  return [...byRule.values()]
}
