import { describe, it, expect } from 'vitest'
import type { SheetData } from '@/types'
import type { ExecutionContext } from '../executor'
import {
  parseColumns,
  parseRows,
  handleSetColumnWidth,
  handleSetRowHeight,
  handleAutoFit,
} from './layoutOps'

function makeSheet(cells: Record<string, string | number> = {}): SheetData {
  const sheetCells: SheetData['cells'] = {}
  for (const [id, value] of Object.entries(cells)) sheetCells[id] = { value }
  return { id: 's1', name: 'S', cells: sheetCells, columnWidths: {}, rowHeights: {} }
}

function makeCtx(sheet: SheetData) {
  const colWidths: Record<number, number> = {}
  const rowHeights: Record<number, number> = {}
  const history: string[] = []
  const ctx = {
    getActiveSheet: () => sheet,
    getComputedValue: () => '',
    pushHistory: (d: string) => history.push(d),
    setColumnWidth: (col: number, width: number) => { colWidths[col] = width },
    setRowHeight: (row: number, height: number) => { rowHeights[row] = height },
    autoFitRows: (rows: number[]) => rows.length, // pretend every row changed
  } as unknown as ExecutionContext
  return { ctx, colWidths, rowHeights, history }
}

describe('parseColumns', () => {
  it('parses single letters, ranges, and comma lists', () => {
    expect(parseColumns('B')).toEqual([1])
    expect(parseColumns('B:D')).toEqual([1, 2, 3])
    expect(parseColumns('B,D,F')).toEqual([1, 3, 5])
    expect(parseColumns('D:B')).toEqual([1, 2, 3]) // reversed range normalizes
  })
  it('rejects garbage and dedupes', () => {
    expect(parseColumns('nonsense !@#')).toEqual([])
    expect(parseColumns('B,B,B')).toEqual([1])
  })
})

describe('parseRows', () => {
  it('converts 1-based input to 0-based indices', () => {
    expect(parseRows('2')).toEqual([1])
    expect(parseRows('2:5')).toEqual([1, 2, 3, 4])
    expect(parseRows(2)).toEqual([1])
    expect(parseRows('2,4')).toEqual([1, 3])
  })
})

describe('handleSetColumnWidth', () => {
  it('sets width for a column range and records one history point', () => {
    const sheet = makeSheet()
    const { ctx, colWidths, history } = makeCtx(sheet)
    const r = handleSetColumnWidth({ column: 'B:D', width: 200 }, ctx, sheet)
    expect(r.success).toBe(true)
    expect(r.modified).toBe(3)
    expect(colWidths).toEqual({ 1: 200, 2: 200, 3: 200 })
    expect(history).toHaveLength(1)
  })
  it('fails without a numeric width', () => {
    const sheet = makeSheet()
    const { ctx } = makeCtx(sheet)
    expect(handleSetColumnWidth({ column: 'B' }, ctx, sheet).success).toBe(false)
  })
})

describe('handleSetRowHeight', () => {
  it('sets height for the resolved 0-based rows', () => {
    const sheet = makeSheet()
    const { ctx, rowHeights } = makeCtx(sheet)
    const r = handleSetRowHeight({ row: '2:3', height: 40 }, ctx, sheet)
    expect(r.success).toBe(true)
    expect(rowHeights).toEqual({ 1: 40, 2: 40 })
  })
})

describe('handleAutoFit', () => {
  it('fits populated rows when none specified', () => {
    const sheet = makeSheet({ A1: 'x', A3: 'y' })
    const { ctx } = makeCtx(sheet)
    const r = handleAutoFit({}, ctx, sheet)
    expect(r.success).toBe(true)
    expect(r.modified).toBe(2) // rows 0 and 2
  })
  it('fails on an empty sheet', () => {
    const sheet = makeSheet()
    const { ctx } = makeCtx(sheet)
    expect(handleAutoFit({}, ctx, sheet).success).toBe(false)
  })
  it('succeeds as a no-op when rows exist but none needed resizing (finding #6)', () => {
    // Populated sheet, but autoFitRows reports zero rows changed (no wrapped
    // content). This must be a SUCCESS so a makeover macro that always appends
    // auto_fit is not rolled back.
    const sheet = makeSheet({ A1: 'x', A2: 'y' })
    const ctx = {
      getActiveSheet: () => sheet,
      getComputedValue: () => '',
      pushHistory: () => {},
      autoFitRows: () => 0, // nothing had wrapped content
    } as unknown as ExecutionContext
    const r = handleAutoFit({}, ctx, sheet)
    expect(r.success).toBe(true)
    expect(r.modified).toBe(0)
  })

  it('with NO target still routes to the ROW branch (back-compat)', () => {
    // No `target` param must fit rows exactly as before — autoFitColumns absent,
    // autoFitRows drives the result.
    const sheet = makeSheet({ A1: 'x', C2: 'y' })
    let colsCalled = false
    const ctx = {
      getActiveSheet: () => sheet,
      getComputedValue: () => '',
      pushHistory: () => {},
      autoFitRows: (rows: number[]) => rows.length,
      autoFitColumns: () => { colsCalled = true; return 0 },
    } as unknown as ExecutionContext
    const r = handleAutoFit({}, ctx, sheet)
    expect(r.success).toBe(true)
    expect(r.modified).toBe(2) // rows 0 and 1
    expect(colsCalled).toBe(false)
  })
})

describe('handleAutoFit — columns', () => {
  function makeColCtx(sheet: SheetData, autoFitColumns: (cols: number[]) => number) {
    const history: string[] = []
    const ctx = {
      getActiveSheet: () => sheet,
      getComputedValue: () => '',
      pushHistory: (d: string) => history.push(d),
      autoFitRows: (rows: number[]) => rows.length,
      autoFitColumns,
    } as unknown as ExecutionContext
    return { ctx, history }
  }

  it('fits populated columns when none specified', () => {
    // Populated cols: 0 (A), 2 (C) → 2 columns.
    const sheet = makeSheet({ A1: 'x', C2: 'y' })
    const { ctx } = makeColCtx(sheet, (cols) => cols.length)
    const r = handleAutoFit({ target: 'columns' }, ctx, sheet)
    expect(r.success).toBe(true)
    expect(r.modified).toBe(2)
  })

  it('fits only the explicitly named column', () => {
    const sheet = makeSheet({ A1: 'x', B1: 'y', C1: 'z' })
    let received: number[] = []
    const { ctx } = makeColCtx(sheet, (cols) => { received = cols; return cols.length })
    const r = handleAutoFit({ target: 'columns', column: 'B' }, ctx, sheet)
    expect(r.success).toBe(true)
    expect(received).toEqual([1]) // B = col 1
    expect(r.modified).toBe(1)
  })

  it('fails on an empty sheet', () => {
    const sheet = makeSheet()
    const { ctx } = makeColCtx(sheet, (cols) => cols.length)
    expect(handleAutoFit({ target: 'columns' }, ctx, sheet).success).toBe(false)
  })

  it('succeeds as a no-op when columns exist but none needed resizing (finding #6)', () => {
    const sheet = makeSheet({ A1: 'x', B1: 'y' })
    const { ctx } = makeColCtx(sheet, () => 0)
    const r = handleAutoFit({ target: 'columns' }, ctx, sheet)
    expect(r.success).toBe(true)
    expect(r.modified).toBe(0)
  })

  it('fails when autoFitColumns is not available', () => {
    const sheet = makeSheet({ A1: 'x' })
    const ctx = {
      getActiveSheet: () => sheet,
      getComputedValue: () => '',
      pushHistory: () => {},
      autoFitRows: (rows: number[]) => rows.length,
    } as unknown as ExecutionContext
    expect(handleAutoFit({ target: 'columns' }, ctx, sheet).success).toBe(false)
  })
})
