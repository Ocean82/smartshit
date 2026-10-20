/**
 * Shared NL → tool param helpers for common spreadsheet phrases.
 * Used by the client agent-parser and server actTemplates so coverage stays aligned.
 */

import { isNonCommandRequest } from './requestSafety.js'

/** Map spoken format names to format_cells numberFormat keys. */
const NUMBER_FORMAT_ALIASES: Record<string, string> = {
  currency: 'currency',
  money: 'currency',
  dollar: 'currency',
  dollars: 'currency',
  percent: 'percent',
  percentage: 'percent',
  date: 'date',
  number: 'number',
  accounting: 'accounting',
}

const FILTER_OP_ALIASES: Record<string, string> = {
  '=': 'equals',
  equals: 'equals',
  equal: 'equals',
  eq: 'equals',
  is: 'equals',
  contains: 'contains',
  containing: 'contains',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
  'greater than': 'gt',
  'more than': 'gt',
  'less than': 'lt',
  'at least': 'gte',
  'at most': 'lte',
}

export interface NumberFormatPhrase {
  numberFormat: string
  /** Column letter or header name when specified. */
  range?: string
}

export interface FilterPhrase {
  column: string
  condition: string
  value?: string
}

export interface MultiSortPhrase {
  rules: Array<{ column: string; direction: 'asc' | 'desc' }>
}

export interface FormatAsTablePhrase {
  theme: string
}

export type LayoutPhrase =
  | { kind: 'width'; column: string; width: number }
  | { kind: 'height'; row: string; height: number }
  | { kind: 'autofit'; axis?: 'rows' | 'columns'; row?: string; column?: string }

export type StyleRecipeName = 'header' | 'total_row' | 'table_polish'

export interface StyleRecipePhrase {
  recipe: StyleRecipeName
}

/** Default target width (px) for "wider"/"widen" with no explicit number. */
const WIDER_DEFAULT = 200
/** Default target height (px) for "taller" with no explicit number. */
const TALLER_DEFAULT = 44

function resolveNumberFormatKey(raw: string): string | null {
  const key = raw.toLowerCase().replace(/percentage/, 'percent')
  return NUMBER_FORMAT_ALIASES[key] ?? null
}

function resolveFilterOp(raw: string): string | null {
  return FILTER_OP_ALIASES[raw.toLowerCase().trim()] ?? null
}

function cleanColumnToken(raw: string): string {
  return raw
    .replace(/\b(asc|ascending|desc|descending|highest|lowest|a-z|z-a|first|last|order|column|the|by)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Uppercase single/multi-letter column refs; leave header names as captured. */
export function normalizeColumnRef(token: string): string {
  const cleaned = cleanColumnToken(token)
  if (/^[a-z]{1,3}$/i.test(cleaned)) return cleaned.toUpperCase()
  return cleaned
}

/**
 * "format column B as currency", "apply currency formatting to Amount",
 * "format as percent", "show column C as dates"
 */
export function parseNumberFormatPhrase(text: string): NumberFormatPhrase | null {
  const trimmed = text.trim()

  // Bare percent phrasing with no explicit column — the §4 example
  // "show these as percentages" and "show as a percentage". Requires a
  // show/make/format/display verb so unrelated "percent" questions don't match,
  // and a pronoun/"a" target (these/those/this/it/them/a) so a real column name
  // still falls through to the column-aware paths below.
  const barePercent = trimmed.match(
    /\b(?:show|make|format|display)\s+(?:(?:these|those|this|it|them)\s+)?(?:(?:numbers?|values?|cells?|column)\s+)?(?:as|to|like|into)\s+(?:a\s+)?percent(?:age)?s?\b\s*$/i,
  )
  if (barePercent) return { numberFormat: 'percent' }

  const applyMatch = trimmed.match(
    /\b(?:apply|use)\s+(currency|percent(?:age)?|date|number|accounting|money|dollars?)\s+(?:formatting|format|style)\s*(?:to\s+(?:column\s+)?([a-z0-9_ ]+?))?\s*$/i,
  )
  if (applyMatch) {
    const numberFormat = resolveNumberFormatKey(applyMatch[1])
    if (!numberFormat) return null
    const range = applyMatch[2] ? normalizeColumnRef(applyMatch[2]) : undefined
    return range ? { numberFormat, range } : { numberFormat }
  }

  const formatMatch = trimmed.match(
    /\b(?:format|show|display|make)\s+(?:(?:column\s+)?([a-z0-9_ ]+?)\s+)?(?:as|to|like)\s+(currency|percent(?:age)?|date|number|accounting|money|dollars?)\b/i,
  )
  if (formatMatch) {
    const numberFormat = resolveNumberFormatKey(formatMatch[2])
    if (!numberFormat) return null
    const rangeRaw = formatMatch[1] ? cleanColumnToken(formatMatch[1]) : undefined
    if (!rangeRaw || /^(this|it|the data|the sheet|the range|selection)$/i.test(rangeRaw)) {
      return { numberFormat }
    }
    return { numberFormat, range: normalizeColumnRef(rangeRaw) }
  }

  return null
}

/**
 * "filter where Status is Paid", "filter Amount > 100",
 * "show only rows where Status equals Paid", "filter by Status contains Over"
 */
export function parseFilterPhrase(text: string): FilterPhrase | null {
  const trimmed = text.trim()

  // Reject vague "filter it" / "filter the data" with no predicate
  if (/^(?:filter|show\s+only|only\s+show)\s+(?:it|this|the\s+(?:data|sheet|rows?))?\s*$/i.test(trimmed)) {
    return null
  }

  const whereMatch = trimmed.match(
    /\b(?:filter|show\s+only|only\s+show)\s+(?:(?:rows?|entries|items|records)\s+)?(?:where\s+|by\s+)?(?:column\s+)?["']?([a-z0-9_ ]+?)["']?\s*(=|equals?|eq|is|contains|containing|>=|<=|>|<|greater\s+than|less\s+than|more\s+than|at\s+least|at\s+most)\s*["']?(.+?)["']?\s*$/i,
  )
  if (!whereMatch) return null

  // Free-form "... into a (new) range/sheet/column" has no destination a
  // declarative filter can honour — a filter narrows the current rows, it does
  // not write a subset elsewhere. Defer so the LLM emits execute_script.
  if (/\binto\s+(?:a\s+)?(?:new\s+)?(?:range|sheet|column|tab|area|location)\b/i.test(trimmed)) {
    return null
  }

  const column = normalizeColumnRef(whereMatch[1])
  const condition = resolveFilterOp(whereMatch[2])
  const value = whereMatch[3].trim().replace(/^["']|["']$/g, '')
  if (!column || !condition || !value) return null
  if (/^(rows?|entries|items|records|data|sheet|the)$/i.test(column)) return null
  // A captured column that still carries a clause keyword as a whole word
  // (e.g. "rows where status") was mis-captured from a free-form phrasing the
  // regex over-matched — it is not a real column. Defer rather than emit a
  // nonsense filter. Real columns ("Status", "Amount", "Over") are unaffected.
  if (/\b(?:rows?|where|entries|items|records)\b/i.test(column)) return null

  return { column, condition, value }
}

/**
 * "sort by Category then Amount", "sort by A and then by B descending"
 *
 * "and then" requires an explicit "by" before the second column so compound
 * commands ("sort by date and then bold the header") still defer to macros.
 */
export function parseMultiSortPhrase(text: string): MultiSortPhrase | null {
  const trimmed = text.trim()
  if (!/\bsort\b/i.test(trimmed)) return null

  const match = trimmed.match(
    /\bsort\s+(?:(?:my|the|this)\s+(?:data|sheet)\s+)?(?:by|on)\s+(?:the\s+)?["']?([\w ]+?)["']?\s+(?:then(?:\s+by)?|and\s+then\s+by)\s+(?:the\s+)?["']?([\w ]+?)["']?\s*$/i,
  )
  if (!match) return null

  const dirHint = trimmed.toLowerCase().match(/\b(asc|ascending|desc|descending|highest|lowest|a-z|z-a)\b/g) ?? []
  const lastDir = dirHint[dirHint.length - 1] ?? ''
  const direction = ['desc', 'descending', 'highest', 'z-a'].includes(lastDir) ? 'desc' : 'asc'

  const col1 = normalizeColumnRef(match[1])
  const col2 = normalizeColumnRef(match[2])
  if (!col1 || !col2 || col1.toLowerCase() === col2.toLowerCase()) return null
  // Reject tokens that look like follow-on actions, not column names
  if (/\b(bold|highlight|format|delete|clear|filter|add|remove|rename|color|colour|make|create|insert)\b/i.test(col2)) {
    return null
  }
  if (col2.split(/\s+/).length > 3) return null

  return {
    rules: [
      { column: col1, direction: 'asc' },
      { column: col2, direction },
    ],
  }
}

/** True when the message is a multi-column sort (should not defer as a compound request). */
export function isMultiSortPhrase(text: string): boolean {
  return parseMultiSortPhrase(text) != null
}

/**
 * "format this as a table", "make it a table", "apply table formatting"
 */
export function parseFormatAsTablePhrase(text: string): FormatAsTablePhrase | null {
  const lower = text.toLowerCase().trim()
  const matched =
    /\b(?:format|make|turn|convert)\s+(?:this|it|the\s+(?:data|sheet|range))?\s*(?:as|into|to|like)\s+(?:a\s+)?(?:proper\s+)?table\b/.test(lower)
    || /\b(?:as\s+a\s+table|table\s+formatting|format\s+as\s+table)\b/.test(lower)
    || /\bmake\s+(?:this|it)\s+look\s+like\s+a\s+(?:proper\s+)?table\b/.test(lower)
    || /\bmake\s+(?:this|it|the\s+(?:data|sheet))?\s+(?:a\s+)?(?:proper\s+)?table\b/.test(lower)

  if (!matched) return null
  // Avoid stealing "pivot table" educational questions
  if (/\bpivot\b/.test(lower)) return null

  const theme = lower.match(/\b(blue|green|purple|orange|slate|minimal)\b/)?.[1] ?? 'blue'
  return { theme }
}

/** Normalize a column token to "B" or a range "B:D" (uppercased); null if not column-like. */
function normalizeColumnSpec(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (/^[A-Z]{1,3}(:[A-Z]{1,3})?$/.test(t)) return t
  return null
}

/**
 * Layout phrases → set_column_width / set_row_height / auto_fit.
 *
 * Width:  "set column C width to 200", "make column B wider", "widen columns B:D"
 * Height: "set row 2 height to 40", "make row 1 taller"
 * Autofit:"auto-fit the rows", "resize rows to fit content", "auto fit row heights"
 */
export function parseLayoutPhrase(text: string): LayoutPhrase | null {
  const t = text.trim()
  const lower = t.toLowerCase()

  // Column auto-fit — checked BEFORE the row branch, gated on a column noun so
  // it never swallows "auto-fit the rows" / "resize rows to fit". Covers
  // "auto-size the columns", "fix the column widths", "fit the columns",
  // "resize columns to fit", and "auto-fit the columns" (the last previously
  // misrouted into the row branch — that is the bug this fixes).
  const columnFitIntent =
    (/\bauto[-\s]?fit\b/.test(lower) && /\bcolumns?\b/.test(lower))
    || /\bauto[-\s]?size\s+(?:the\s+)?columns?\b/.test(lower)
    || /\bfix\s+(?:the\s+)?columns?(?:\s+widths?)?\b/.test(lower)
    || /\bfit\s+(?:the\s+)?columns?\b/.test(lower)
    || /\bresize\s+(?:the\s+)?columns?\s+to\s+fit\b/.test(lower)
  if (columnFitIntent) {
    const colSpec = t.match(/\bcolumns?\s+([a-z]{1,3}(?::[a-z]{1,3})?)\b/i)?.[1]
    // Exclude English connectors that happen to be valid column refs ("to",
    // "by", "of", "fit") so "resize columns to fit" fits ALL columns, not "TO".
    const isConnector = colSpec != null && /^(?:to|by|of|fit)$/i.test(colSpec)
    const column = colSpec && !isConnector ? normalizeColumnSpec(colSpec) : null
    return column ? { kind: 'autofit', axis: 'columns', column } : { kind: 'autofit', axis: 'columns' }
  }

  // Auto-fit (rows) — checked first so "resize rows to fit" doesn't fall into
  // height. Returns no `axis` key (defaults to rows) so the row path stays
  // byte-for-byte unchanged for existing consumers and tests.
  if (/\bauto[-\s]?fit\b/.test(lower) || /\bresize\s+rows?\s+to\s+fit\b/.test(lower) || /\bfit\s+rows?\s+to\s+(?:the\s+)?content\b/.test(lower)) {
    const rowSpec = lower.match(/\brows?\s+(\d+(?::\d+)?)\b/)?.[1]
    return rowSpec ? { kind: 'autofit', row: rowSpec } : { kind: 'autofit' }
  }

  // Explicit width: "... column B width to 200", "set width of column B to 200"
  const widthTo = t.match(/\bcolumns?\s+([a-z]{1,3}(?::[a-z]{1,3})?)\b[^\d]*?\bwidth\b[^\d]*?(\d{1,4})\b/i)
    ?? t.match(/\bwidth\s+of\s+columns?\s+([a-z]{1,3}(?::[a-z]{1,3})?)\b[^\d]*?(\d{1,4})\b/i)
    ?? t.match(/\bset\s+columns?\s+([a-z]{1,3}(?::[a-z]{1,3})?)\b[^\d]*?(\d{1,4})\s*px\b/i)
  if (widthTo) {
    const column = normalizeColumnSpec(widthTo[1])
    const width = parseInt(widthTo[2], 10)
    if (column && Number.isFinite(width)) return { kind: 'width', column, width }
  }

  // Relative width: "make column B wider", "widen columns B:D"
  const widerMatch = t.match(/\b(?:make\s+)?(?:the\s+)?columns?\s+([a-z]{1,3}(?::[a-z]{1,3})?)\s+wider\b/i)
    ?? t.match(/\bwiden\s+(?:the\s+)?columns?\s+([a-z]{1,3}(?::[a-z]{1,3})?)\b/i)
  if (widerMatch) {
    const column = normalizeColumnSpec(widerMatch[1])
    if (column) return { kind: 'width', column, width: WIDER_DEFAULT }
  }

  // Explicit height: "set row 2 height to 40", "row 2:5 height 32"
  const heightTo = t.match(/\brows?\s+(\d+(?::\d+)?)\b[^\d]*?\bheight\b[^\d]*?(\d{1,4})\b/i)
    ?? t.match(/\bheight\s+of\s+rows?\s+(\d+(?::\d+)?)\b[^\d]*?(\d{1,4})\b/i)
  if (heightTo) {
    const row = heightTo[1]
    const height = parseInt(heightTo[2], 10)
    if (Number.isFinite(height)) return { kind: 'height', row, height }
  }

  // Relative height: "make row 1 taller"
  const tallerMatch = t.match(/\b(?:make\s+)?(?:the\s+)?rows?\s+(\d+(?::\d+)?)\s+taller\b/i)
  if (tallerMatch) {
    return { kind: 'height', row: tallerMatch[1], height: TALLER_DEFAULT }
  }

  return null
}

/**
 * Style-recipe phrases → style_recipe tool.
 *
 * header:      "style the header row", "make the header stand out", "format the headers"
 * total_row:   "add a total row", "add totals at the bottom", "add a totals row"
 * table_polish:"polish this table", "make this table look nice"
 *
 * NOTE: kept distinct from the simpler "bold the headers" (plain bold via
 * format_cells) and "format as table" (format_as_table) so those keep working.
 */
export function parseStyleRecipePhrase(text: string): StyleRecipePhrase | null {
  const lower = text.toLowerCase().trim()

  // total_row — a totals row with formulas
  if (/\badd\s+(?:a\s+)?(?:grand\s+)?total(?:s)?\s+row\b/.test(lower)
    || /\badd\s+(?:a\s+)?(?:grand\s+)?totals?\s+(?:at\s+the\s+bottom|to\s+the\s+bottom)\b/.test(lower)) {
    return { recipe: 'total_row' }
  }

  // header — styled header row (not just bold). Require "header" + a styling verb.
  if (/\b(?:style|format|design)\s+(?:the\s+)?header(?:s|\s+row)?\b/.test(lower)
    || /\bmake\s+(?:the\s+)?headers?\s+stand\s+out\b/.test(lower)
    || /\bstyle\s+(?:the\s+)?header\s+row\b/.test(lower)) {
    return { recipe: 'header' }
  }

  // table_polish — full table styling via the "polish" verb (format-as-table
  // owns "make it a table"; this owns explicit polish requests).
  if (/\bpolish\s+(?:this|the|my)?\s*table\b/.test(lower)
    || /\bmake\s+(?:this|the|my)\s+table\s+look\s+(?:nice|good|better|polished)\b/.test(lower)) {
    return { recipe: 'table_polish' }
  }

  return null
}

/**
 * General "make my sheet look professional" phrasing → the value-safe makeover.
 *
 * Matches broad, whole-sheet polish requests ("make this look professional",
 * "clean up the formatting", "format this like a pro", "professionalize my
 * sheet") so a general ask out-ranks the narrow recipes. It MUST NOT steal the
 * specific phrases those recipes own — "bold/style the header", "add a total
 * row", "polish this table" (parseStyleRecipePhrase) or "format as a table"
 * (parseFormatAsTablePhrase) — so those keep their existing routing. Narrow
 * phrases are excluded by deferring to the recipe parsers.
 */
export function parseProfessionalizePhrase(text: string): boolean {
  const lower = text.toLowerCase().trim()

  // Belt-and-braces: never build a makeover for a negated/explanatory/quoted
  // utterance ("don't professionalize this", "no need to clean this up"), even
  // for callers that do not pre-gate with isNonCommandRequest.
  if (isNonCommandRequest(lower)) return false

  // Defer the narrow phrases to their owning parsers — a general makeover must
  // never swallow "add a total row" / "style the header" / "polish this table"
  // / "format as a table".
  if (parseStyleRecipePhrase(lower) != null) return false
  if (parseFormatAsTablePhrase(lower) != null) return false

  // "make (this|it|my sheet|the sheet) look professional/nice/clean/presentable"
  if (/\bmake\s+(?:this|it|my\s+(?:sheet|spreadsheet|data)|the\s+(?:sheet|spreadsheet|data))\s+look\s+(?:professional|nice|clean|presentable|polished)\b/.test(lower)) {
    return true
  }

  // "professionalize (this|my sheet)"
  if (/\bprofessionali[sz]e\b/.test(lower)) return true

  // "clean up the formatting" / "clean up this sheet"
  if (/\bclean\s+up\s+(?:the\s+)?(?:formatting|format|styling|style|this|my\s+(?:sheet|spreadsheet|data)|the\s+(?:sheet|spreadsheet|data))\b/.test(lower)) {
    return true
  }

  // "format (this|it|my sheet) like a pro / professionally"
  if (/\bformat\s+(?:this|it|my\s+(?:sheet|spreadsheet|data)|the\s+(?:sheet|spreadsheet|data))?\s*(?:like\s+a\s+pro|professionally)\b/.test(lower)) {
    return true
  }

  return false
}
