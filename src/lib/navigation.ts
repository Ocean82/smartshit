/**
 * Find, go-to and select: turn "go to C5", "select column B", "find rent" or
 * "where is the total?" into a selection, without an LLM.
 *
 * Read-only: it moves the selection and scrolls, never edits the sheet, so it
 * may run from any chat mode. Anything it cannot read with confidence returns
 * null and continues down the pipeline: superlatives ("find the biggest
 * expense") belong to the max/min tools, and analysis ("find duplicates",
 * "find out why…", "show me the data in column B") to the auditor and the model.
 */
import type { SheetData, Selection } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { letterToCol } from '@/lib/cellRef'

export type NavigationRequest =
  | { kind: 'range'; range: string }
  | { kind: 'find'; text: string }

const POLITE = /^(?:(?:please|pls|can you|could you|would you|will you|i want to|i need to)\s+)*/
/** Move to a place: a cell or range, or else a value to search for. */
const GO_VERB = /^(?:go\s*to|jump\s+to|scroll\s+to|navigate\s+to|take\s+me\s+to)\s+/
/** Select a cell, range, column or row. Nothing else ("select everything", "show me a chart"). */
const SELECT_VERB = /^(?:select|show\s+me)\s+/
/** Search for a value. */
const FIND_VERB = /^(?:find|search(?:\s+for)?|look\s+for|locate|where\s+(?:is|are|was|were)|where's|show\s+me\s+where|which\s+cells?\s+(?:has|have|contains?|says?))\s+/

const CELL = /^(?:cell\s+)?([a-z]{1,3}\d{1,7})(?::([a-z]{1,3}\d{1,7}))?$/
const COLUMN = /^(?:the\s+)?col(?:umn)?\s+([a-z]{1,3})$/
const ROW = /^(?:the\s+)?row\s+(\d{1,7})$/

/** "Go to the next sheet / the top / the end" are not values to search for. */
const GO_ELSEWHERE = /^(?:the\s+)?(?:sheet|tab|page|next|previous|top|bottom|end|start|beginning)\b/
/** Words that make "find X" a different request: a superlative, an analysis, or "find out". */
const NOT_A_SEARCH = /\b(?:biggest|largest|highest|lowest|smallest|max(?:imum)?|min(?:imum)?|most|least|duplicates?|errors?|mistakes?|problems?|issues?|outliers?|unusual|blanks?|empty|missing|formulas?|out|average|how|why|what)\b/
const FILLER_HEAD = /^(?:the|my|a|an|all|any|every|some|cells?\s+(?:with|containing|that\s+says?)|word|text|value)\s+/
const FILLER_TAIL = /\s+(?:is|are|row|rows|cell|cells|column|line|entry|entries|value|values|on\s+this\s+sheet|in\s+this\s+sheet|here)$/

/** Parse a navigation request, or return null if the message is not one. */
export function parseNavigationRequest(message: string): NavigationRequest | null {
  const lower = message.trim().toLowerCase().replace(/[‘’]/g, "'").replace(/[?.!]+$/, '').replace(POLITE, '')
  // Search before select, so "show me where rent is" searches while "show me C5" selects.
  const go = GO_VERB.exec(lower)
  const find = go ? null : FIND_VERB.exec(lower)
  const select = go || find ? null : SELECT_VERB.exec(lower)
  const verb = go ?? find ?? select
  if (!verb) return null

  const target = lower.slice(verb[0].length).trim()
  const range = parseRangeTarget(target)
  if (range) return { kind: 'range', range }
  if (select) return null
  if (go && GO_ELSEWHERE.test(target)) return null
  if (NOT_A_SEARCH.test(target)) return null

  let text = target
  for (let i = 0; i < 3; i++) text = text.replace(FILLER_HEAD, '').replace(FILLER_TAIL, '')
  text = text.replace(/^["'“]|["'”]$/g, '').trim()
  // A long phrase is a question for the model, not a cell value.
  if (!text || text.split(/\s+/).length > 4 || text.length > 40) return null
  return { kind: 'find', text }
}

/**
 * `select_cells` params → a request. `range` takes A1 ("C5", "A1:C5"),
 * "column B", "row 5", or the parser's own "column:B" / "row:5"; `find` takes
 * a value to search for.
 */
export function navigationRequestFromParams(params: Record<string, unknown>): NavigationRequest | null {
  const range = typeof params.range === 'string' ? params.range.trim().toLowerCase() : ''
  if (range) {
    const spec = /^(column|row):([a-z]{1,3}|\d{1,7})$/.exec(range)
    const parsed = spec ? parseRangeTarget(`${spec[1]} ${spec[2]}`) : parseRangeTarget(range)
    return parsed ? { kind: 'range', range: parsed } : null
  }
  const find = typeof params.find === 'string' ? params.find.trim() : ''
  return find ? { kind: 'find', text: find } : null
}

function parseRangeTarget(target: string): string | null {
  const cell = CELL.exec(target)
  if (cell) return (cell[2] ? `${cell[1]}:${cell[2]}` : cell[1]).toUpperCase()
  const col = COLUMN.exec(target)
  if (col) return `column:${col[1].toUpperCase()}`
  const row = ROW.exec(target)
  if (row && Number(row[1]) >= 1) return `row:${row[1]}`
  return null
}

/** Populated extent of a sheet, 0-indexed. */
function extent(sheet: SheetData): { lastRow: number; lastCol: number } {
  let lastRow = 0
  let lastCol = 0
  for (const id of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(id)
    if (row > lastRow) lastRow = row
    if (col > lastCol) lastCol = col
  }
  return { lastRow, lastCol }
}

/** A range spec from parseNavigationRequest → a Selection. Columns and rows span the used part of the sheet. */
export function rangeToSelection(range: string, sheet: SheetData): Selection {
  const { lastRow, lastCol } = extent(sheet)
  if (range.startsWith('column:')) {
    const col = letterToCol(range.slice('column:'.length))
    return { startRow: 0, startCol: col, endRow: lastRow, endCol: col }
  }
  if (range.startsWith('row:')) {
    const row = Number(range.slice('row:'.length)) - 1
    return { startRow: row, startCol: 0, endRow: row, endCol: lastCol }
  }
  const [a, b = a] = range.split(':')
  const start = cellToRef(a)
  const end = cellToRef(b)
  return {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col),
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Cells whose displayed value contains `text`, case-insensitive, in reading
 * order. Whole-word matches win, so "rent" finds "Rent" and "Monthly rent"
 * rather than "Current"; substrings are used only when no whole word matches.
 */
export function findCells(
  sheet: SheetData,
  text: string,
  getValue: (row: number, col: number) => string,
): string[] {
  const needle = text.toLowerCase()
  const word = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(needle)}(?:$|[^\\p{L}\\p{N}])`, 'u')
  const whole: Array<[number, number, string]> = []
  const partial: Array<[number, number, string]> = []
  for (const id of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(id)
    const value = String(getValue(row, col) ?? '').toLowerCase()
    if (!value.includes(needle)) continue
    ;(word.test(value) ? whole : partial).push([row, col, id])
  }
  const hits = whole.length ? whole : partial
  return hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((h) => h[2])
}

export interface NavigationOutcome {
  selections: Selection[]
  message: string
}

const MAX_SELECTED = 200
const MAX_LISTED = 8

/** Resolve a request on the active sheet; when a search misses, say which other sheet has it. */
export function resolveNavigation(
  request: NavigationRequest,
  sheet: SheetData,
  getValue: (row: number, col: number) => string,
  otherSheets: SheetData[] = [],
): NavigationOutcome {
  if (request.kind === 'range') {
    const label = request.range.startsWith('column:')
      ? `column ${request.range.slice('column:'.length)}`
      : request.range.startsWith('row:')
        ? `row ${request.range.slice('row:'.length)}`
        : request.range
    return { selections: [rangeToSelection(request.range, sheet)], message: `Selected **${label}**.` }
  }

  const ids = findCells(sheet, request.text, getValue)
  if (ids.length === 0) {
    for (const other of otherSheets) {
      // Other sheets have no live engine values here; stored values cover typed text.
      const elsewhere = findCells(other, request.text, (r, c) => String(other.cells[refToCell(r, c)]?.value ?? ''))
      if (elsewhere.length) {
        return {
          selections: [],
          message: `**${request.text}** isn't on this sheet. It's on **${other.name}** (${listCells(elsewhere)}). Switch to that sheet and ask again to jump to it.`,
        }
      }
    }
    return { selections: [], message: `I couldn't find **${request.text}** on this sheet.` }
  }

  const selections = ids.slice(0, MAX_SELECTED).map((id) => {
    const { row, col } = cellToRef(id)
    return { startRow: row, startCol: col, endRow: row, endCol: col }
  })
  const first = ids[0]
  if (ids.length === 1) {
    const { row, col } = cellToRef(first)
    const shown = getValue(row, col)
    const detail = shown.toLowerCase() === request.text.toLowerCase() ? '' : ` ("${shown.length > 60 ? `${shown.slice(0, 57)}…` : shown}")`
    return { selections, message: `Found **${request.text}** in **${first}**${detail}.` }
  }
  const capped = ids.length > MAX_SELECTED ? ` The first ${MAX_SELECTED} are selected.` : ' All are selected.'
  return {
    selections,
    message: `Found **${request.text}** in ${ids.length} cells: ${listCells(ids)}.${capped} Showing **${first}**.`,
  }
}

function listCells(ids: string[]): string {
  const head = ids.slice(0, MAX_LISTED).join(', ')
  return ids.length > MAX_LISTED ? `${head} and ${ids.length - MAX_LISTED} more` : head
}
