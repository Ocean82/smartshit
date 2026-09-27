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
})
