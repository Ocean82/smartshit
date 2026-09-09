/**
 * Serialize/parse a rectangular cell block to and from textual clipboard formats.
 * Pure functions — no DOM/store access — so they are fully unit-testable.
 *
 * Ref encoding follows the engine: refs are `${colToLetter(col)}${row + 1}` (e.g. "A1"),
 * identical to `refToCell`/`cellToRef` in `@/lib/cellRef`.
 */
import type { CellData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'

/** Serialize a cell block. `selection` defines the rectangle's extent. */
export function encodeCellBlock(
  cells: Record<string, CellData>,
  selection: { startRow: number; startCol: number; endRow: number; endCol: number },
): { tsv: string; csv: string; text: string } {
  const minR = Math.min(selection.startRow, selection.endRow)
  const maxR = Math.max(selection.startRow, selection.endRow)
  const minC = Math.min(selection.startCol, selection.endCol)
  const maxC = Math.max(selection.startCol, selection.endCol)

  const rows: string[] = []
  for (let r = minR; r <= maxR; r++) {
    const line: string[] = []
    for (let c = minC; c <= maxC; c++) {
      const ref = refToCell(r, c)
      const cell = cells[ref]
      let text = ''
      if (cell) {
        text = cell.formula != null && cell.formula !== ''
          ? cell.formula
          : (cell.value == null ? '' : String(cell.value))
      }
      line.push(text)
    }
    rows.push(line.join('\t'))
  }
  const tsv = rows.join('\n')
  return {
    tsv,
    csv: toCsv(rows.map((r) => r.split('\t'))),
    text: tsv,
  }
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
          return cell
        })
        .join(','),
    )
    .join('\n')
}

/** Normalize CRLF to LF and split into lines. */
function toRows(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

/**
 * Parse grid-shaped clipboard text into refs + values + bounding rect. Returns null
 * when there is no usable content. `cellRefs`/`valuesByRef` only contain cells with
 * non-empty content; the caller expands to the full `rect` when applying.
 */
export function parseGridClipboard(
  text: string,
  format: 'tsv' | 'csv' | 'text',
): {
  cellRefs: string[]
  valuesByRef: Record<string, string>
  rect: { startRow: number; startCol: number; endRow: number; endCol: number }
} | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  let rows: string[][]
  if (format === 'csv') {
    rows = parseCsv(trimmed)
  } else {
    rows = toRows(text).map((line) => line.split('\t'))
  }
  // Drop trailing blank rows, keep interior blanks.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) {
    rows.pop()
  }
  if (rows.length === 0) return null

  const maxCols = rows.reduce((m, r) => Math.max(m, Math.max(r.length, 1)), 0)
  if (maxCols === 0) return null

  const cellRefs: string[] = []
  const valuesByRef: Record<string, string> = {}
  rows.forEach((row, r) => {
    for (let c = 0; c < maxCols; c++) {
      const val = row[c] ?? ''
      if (val !== '') {
        const ref = refToCell(r, c)
        cellRefs.push(ref)
        valuesByRef[ref] = val
      }
    }
  })
  if (cellRefs.length === 0) return null

  return {
    cellRefs,
    valuesByRef,
    rect: {
      startRow: 0,
      startCol: 0,
      endRow: rows.length - 1,
      endCol: maxCols - 1,
    },
  }
}

/** Minimal CSV parser (handles quoted fields, escaped quotes, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [[]]
  let field = ''
  let i = 0
  const input = text + '\n'
  while (i < input.length) {
    const ch = input[i]
    if (ch === '"') {
      if (input[i + 1] === '"') {
        field += '"'
        i += 2
      } else {
        i++
        let closed = false
        while (i < input.length && !closed) {
          if (input[i] === '"') {
            if (input[i + 1] === '"') {
              field += '"'
              i += 2
            } else {
              closed = true
              i++
            }
          } else {
            field += input[i]
            i++
          }
        }
      }
    } else if (ch === ',') {
      rows[rows.length - 1].push(field)
      field = ''
      i++
    } else if (ch === '\n' || ch === '\r') {
      rows[rows.length - 1].push(field)
      field = ''
      if (ch === '\r' && input[i + 1] === '\n') i++
      rows.push([])
      i++
    } else {
      field += ch
      i++
    }
  }
  // Remove the trailing empty row produced by the sentinel newline.
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop()
  }
  return rows
}