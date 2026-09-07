/**
 * Shared NL → tool param helpers for common spreadsheet phrases.
 * Used by the client agent-parser and server actTemplates so coverage stays aligned.
 */

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

  const column = normalizeColumnRef(whereMatch[1])
  const condition = resolveFilterOp(whereMatch[2])
  const value = whereMatch[3].trim().replace(/^["']|["']$/g, '')
  if (!column || !condition || !value) return null
  if (/^(rows?|entries|items|records|data|sheet|the)$/i.test(column)) return null

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
