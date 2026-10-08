/**
 * Question-focused data — exact values for the cells and columns a question names.
 *
 * The general context sent to the model is a compressed, possibly truncated
 * snapshot. When a question names a cell ("why is C7 so high?") or a column
 * ("is the Actual column over budget?"), this block carries those exact values
 * and formulas so the answer does not depend on what survived compression.
 */

import type { SheetData } from '@/types'
import type { UserIntent } from '@shared/intentTypes'
import { colToLetter, refToCell, tryCellToRef } from '@/lib/cellRef'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { resolveColumnIndex } from '@/agent/toolHandlers/types'

const MAX_FOCUS_COLUMNS = 4
const MAX_FOCUS_ROWS = 300
const MAX_SCANNED_ROWS = 5_000
const MAX_REFERENCED_CELLS = 40
const MAX_SCANNED_RANGE_CELLS = 2_000
const MAX_VALUE_CHARS = 80
const MAX_FORMULA_CHARS = 200
// ponytail: any header named in the message is attached, even generic ones like "Total";
// MAX_FOCUS_COLUMNS/MAX_FOCUS_CHARS bound the cost. Rank by intent if answers get noisy.
const MIN_HEADER_MATCH_LENGTH = 3
export const MAX_FOCUS_CHARS = 12_000

const CELL_REF_RE = /\b([A-Za-z]{1,3})(\d{1,7})(?::([A-Za-z]{1,3})(\d{1,7}))?\b/g

export interface FocusDataInput {
  message: string
  intent?: UserIntent
  sheet: SheetData
  getComputedValue: (row: number, col: number) => string
}

/** Returns '' when the question names no populated cell or known column. */
export function buildFocusData({ message, intent, sheet, getComputedValue }: FocusDataInput): string {
  if (Object.keys(sheet.cells).length === 0) return ''

  const headerRow = findHeaderRow(sheet)
  const sections: string[] = []

  const cellLines = describeReferencedCells(message, sheet, getComputedValue, headerRow)
  if (cellLines.length) sections.push(`Cells named in the question:\n${cellLines.join('\n')}`)

  const columnBlock = describeFocusColumns(message, intent, sheet, getComputedValue, headerRow)
  if (columnBlock) sections.push(columnBlock)

  if (!sections.length) return ''
  const text = sections.join('\n')
  if (text.length <= MAX_FOCUS_CHARS) return text
  const cut = text.lastIndexOf('\n', MAX_FOCUS_CHARS)
  return `${text.slice(0, cut > 0 ? cut : MAX_FOCUS_CHARS)}\n[focus data truncated]`
}

function describeReferencedCells(
  message: string,
  sheet: SheetData,
  getComputedValue: FocusDataInput['getComputedValue'],
  headerRow: number,
): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  let scanned = 0

  for (const match of message.matchAll(CELL_REF_RE)) {
    const start = tryCellToRef(`${match[1]}${match[2]}`)
    if (!start) continue
    const end = (match[3] && tryCellToRef(`${match[3]}${match[4]}`)) || start

    for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
      for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
        if (lines.length >= MAX_REFERENCED_CELLS || ++scanned > MAX_SCANNED_RANGE_CELLS) return lines
        const id = refToCell(r, c)
        if (seen.has(id)) continue
        seen.add(id)
        const line = describeCell(id, r, c, sheet, getComputedValue, headerRow)
        if (line) lines.push(line)
      }
    }
  }
  return lines
}

function describeCell(
  id: string,
  row: number,
  col: number,
  sheet: SheetData,
  getComputedValue: FocusDataInput['getComputedValue'],
  headerRow: number,
): string | null {
  const value = getComputedValue(row, col)
  const formula = sheet.cells[id]?.formula
  if (!value && !formula) return null

  const header = row > headerRow ? getComputedValue(headerRow, col).trim() : ''
  const label = header ? `${id} (${clip(header, MAX_VALUE_CHARS)})` : id
  const formulaText = formula
    ? ` (formula: ${clip(formula.startsWith('=') ? formula : `=${formula}`, MAX_FORMULA_CHARS)})`
    : ''
  return `  ${label} = ${clip(value, MAX_VALUE_CHARS) || '(empty)'}${formulaText}`
}

function describeFocusColumns(
  message: string,
  intent: UserIntent | undefined,
  sheet: SheetData,
  getComputedValue: FocusDataInput['getComputedValue'],
  headerRow: number,
): string {
  let maxCol = -1
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = tryCellToRef(cellId)
    if (ref && ref.col > maxCol) maxCol = ref.col
  }

  const columns = findFocusColumns(message, intent, sheet, getComputedValue, headerRow, maxCol)
  if (!columns.length) return ''

  const header = (c: number) => getComputedValue(headerRow, c).trim()
  const name = (c: number) => header(c) || colToLetter(c)
  const labelCol = columns.includes(0) ? null : 0
  const shown = labelCol === null ? columns : [labelCol, ...columns]

  const lastRow = Math.min(findLastDataRow(sheet), headerRow + MAX_SCANNED_ROWS)
  const rowLines: string[] = []
  let dataRows = 0
  for (let r = headerRow + 1; r <= lastRow; r++) {
    if (columns.every((c) => !getComputedValue(r, c))) continue
    dataRows++
    if (rowLines.length >= MAX_FOCUS_ROWS) continue
    const parts = shown.map((c) => `${name(c)}=${clip(getComputedValue(r, c), MAX_VALUE_CHARS)}`)
    rowLines.push(`  Row ${r + 1}: ${parts.join(' | ')}`)
  }
  if (!rowLines.length) return ''

  const title = columns.map((c) => `${name(c)} (${colToLetter(c)})`).join(', ')
  const more = dataRows > rowLines.length ? `\n  [showing ${rowLines.length} of ${dataRows} rows]` : ''
  return `Columns named in the question — ${title}:\n${rowLines.join('\n')}${more}`
}

function findFocusColumns(
  message: string,
  intent: UserIntent | undefined,
  sheet: SheetData,
  getComputedValue: FocusDataInput['getComputedValue'],
  headerRow: number,
  maxCol: number,
): number[] {
  const columns: number[] = []
  const add = (c: number | null) => {
    if (c == null || c < 0 || c > maxCol || columns.includes(c) || columns.length >= MAX_FOCUS_COLUMNS) return
    columns.push(c)
  }

  for (const name of intent?.targetColumns ?? []) add(resolveColumnIndex(name, sheet, getComputedValue))

  const lower = message.toLowerCase()
  for (let c = 0; c <= maxCol; c++) {
    const header = getComputedValue(headerRow, c).trim().toLowerCase()
    if (header.length >= MIN_HEADER_MATCH_LENGTH && containsWord(lower, header)) add(c)
  }
  return columns
}

function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text)
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
