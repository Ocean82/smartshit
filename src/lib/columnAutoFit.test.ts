import { describe, expect, it } from 'vitest'
import { autoFitColumnWidths } from './columnAutoFit'
import { CELL_PAD_X } from './rowAutoFit'
import { MAX_COL_WIDTH, MIN_COL_WIDTH } from './colLayout'
import type { AutoFitSheetSlice } from './rowAutoFit'

/** Fixed-width measurer: each character is `unit` px wide. */
function fixedMeasurer(unit = 7) {
  return (text: string) => text.length * unit
}

/** Build a minimal sheet slice from a cell map. */
function makeSheet(
  cells: Record<string, string>,
  columnWidths: Record<number, number> = {},
): AutoFitSheetSlice {
  const sheetCells: AutoFitSheetSlice['cells'] = {}
  for (const [id, value] of Object.entries(cells)) sheetCells[id] = { value }
  return { cells: sheetCells, columnWidths, rowHeights: {} }
}

describe('autoFitColumnWidths', () => {
  const measure = fixedMeasurer(7)
  const text = (sheet: AutoFitSheetSlice) => (row: number, col: number) => {
    // Mirror the natural display text: column 0 => A, column 1 => B, etc.
    const colLetter = String.fromCharCode(65 + col)
    const id = `${colLetter}${row + 1}`
    return String(sheet.cells[id]?.value ?? '')
  }

  it('widens a column to its longest cell (header or data) + padding, clamped', () => {
    // Longest cell in col 0 is "Groceries and Rent" (18 chars * 7 = 126).
    const sheet = makeSheet({
      A1: 'Name',
      A2: 'Rent',
      A3: 'Groceries and Rent',
    })
    const next = autoFitColumnWidths(sheet, [0], text(sheet), measure)
    expect(next[0]).toBe(126 + CELL_PAD_X)
  })

  it('counts the header alongside data (widest of header/data wins)', () => {
    // Header "A very long header name here" (28 chars) is wider than any datum.
    const sheet = makeSheet({
      A1: 'A very long header name here',
      A2: 'x',
      A3: 'y',
    })
    const next = autoFitColumnWidths(sheet, [0], text(sheet), measure)
    expect(next[0]).toBe(28 * 7 + CELL_PAD_X)
  })

  it('leaves an only-empty column unchanged (not added to the returned map)', () => {
    const sheet = makeSheet({ A1: 'data' }, { 1: 150 })
    const next = autoFitColumnWidths(sheet, [1], text(sheet), measure)
    // Column 1 has no populated cell — width stays as-is, no new entry forced.
    expect(next[1]).toBe(150)
  })

  it('clamps below MIN_COL_WIDTH up to the minimum', () => {
    // "a" => 7px + 12 pad = 19, below MIN_COL_WIDTH (40).
    const sheet = makeSheet({ A1: 'a' })
    const next = autoFitColumnWidths(sheet, [0], text(sheet), measure)
    expect(next[0]).toBe(MIN_COL_WIDTH)
  })

  it('clamps a giant cell down to MAX_COL_WIDTH', () => {
    const sheet = makeSheet({ A1: 'x'.repeat(500) })
    const next = autoFitColumnWidths(sheet, [0], text(sheet), measure)
    expect(next[0]).toBe(MAX_COL_WIDTH)
  })

  it('only changes columns that need it (unchanged cols keep their width)', () => {
    // Col 0 needs widening; col 1 already matches its content width exactly.
    const content = 'Hello' // 5 * 7 = 35, +12 = 47
    const sheet = makeSheet({ A1: 'Longer content here', B1: content }, { 1: 47 })
    const next = autoFitColumnWidths(sheet, [0, 1], text(sheet), measure)
    expect(next[0]).toBe('Longer content here'.length * 7 + CELL_PAD_X)
    expect(next[1]).toBe(47) // unchanged
  })

  it('returns a no-op (equal) map when nothing needs resizing', () => {
    // "Hello world!!" = 13 * 7 = 91, +12 pad = 103 (above MIN, below MAX) so the
    // stored width already equals the computed width — a true no-op.
    const content = 'Hello world!!'
    const width = content.length * 7 + CELL_PAD_X
    const sheet = makeSheet({ A1: content }, { 0: width })
    const next = autoFitColumnWidths(sheet, [0], text(sheet), measure)
    expect(next[0]).toBe(width)
  })

  it('does not mutate the input columnWidths map', () => {
    const input = { 0: 50 }
    const sheet = makeSheet({ A1: 'Longer content here' }, input)
    autoFitColumnWidths(sheet, [0], text(sheet), measure)
    expect(input).toEqual({ 0: 50 })
  })

  it('skips negative / non-finite column indices', () => {
    const sheet = makeSheet({ A1: 'data' })
    const next = autoFitColumnWidths(sheet, [-1, Number.NaN], text(sheet), measure)
    expect(next).toEqual(sheet.columnWidths)
  })
})
