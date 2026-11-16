import { describe, expect, it, vi } from 'vitest'
import { findCells, navigationRequestFromParams, parseNavigationRequest, resolveNavigation } from './navigation'
import { executeTool, type ExecutionContext } from '@/agent/executor'
import { cellToRef } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'
import { FIRST_SESSION_CORPUS } from '@shared/firstSessionCorpus'

function makeSheet(cells: Record<string, string | number>, name = 'Budget'): SheetData {
  const sheetCells: SheetData['cells'] = {}
  for (const [id, value] of Object.entries(cells)) sheetCells[id] = { value }
  return { id: name, name, cells: sheetCells, columnWidths: {}, rowHeights: {} }
}
const valueOf = (sheet: SheetData) => (row: number, col: number) => {
  for (const [id, cell] of Object.entries(sheet.cells)) {
    const ref = cellToRef(id)
    if (ref.row === row && ref.col === col) return String(cell.value ?? '')
  }
  return ''
}

const budget = makeSheet({
  A1: 'Category', B1: 'Amount',
  A2: 'Current account', B2: 40,
  A3: 'Rent', B3: 1200,
  A4: 'Netflix', B4: 15,
  A5: 'Monthly rent deposit', B5: 300,
  A6: 'Netflix', B6: 15,
  A7: 'Total', B7: 1570,
})

describe('parseNavigationRequest', () => {
  it.each([
    ['go to C5', { kind: 'range', range: 'C5' }],
    ['go to cell C5', { kind: 'range', range: 'C5' }],
    ['jump to B12', { kind: 'range', range: 'B12' }],
    ['select cell C5', { kind: 'range', range: 'C5' }],
    ['select A1:C5', { kind: 'range', range: 'A1:C5' }],
    ['select column B', { kind: 'range', range: 'column:B' }],
    ['select row 5', { kind: 'range', range: 'row:5' }],
    ['show me C5', { kind: 'range', range: 'C5' }],
    ['please go to C5', { kind: 'range', range: 'C5' }],
    ['find C5', { kind: 'range', range: 'C5' }],
    ['find rent', { kind: 'find', text: 'rent' }],
    ['find groceries', { kind: 'find', text: 'groceries' }],
    ['where is the rent?', { kind: 'find', text: 'rent' }],
    ["where's the total", { kind: 'find', text: 'total' }],
    ['where’s the total', { kind: 'find', text: 'total' }],
    ['where is the total', { kind: 'find', text: 'total' }],
    ['where are the expenses', { kind: 'find', text: 'expenses' }],
    ['search for netflix', { kind: 'find', text: 'netflix' }],
    ['locate the total row', { kind: 'find', text: 'total' }],
    ['go to rent', { kind: 'find', text: 'rent' }],
    ['show me where rent is', { kind: 'find', text: 'rent' }],
    ['which cell says groceries', { kind: 'find', text: 'groceries' }],
    ['find "car insurance"', { kind: 'find', text: 'car insurance' }],
    ['can you find netflix', { kind: 'find', text: 'netflix' }],
  ] as const)('%s', (message, expected) => {
    expect(parseNavigationRequest(message)).toEqual(expected)
  })

  it.each([
    // superlatives belong to find_max / find_min
    'find the biggest expense', 'where is the highest amount', 'find the lowest value',
    // analysis belongs to the auditor and the model
    'find duplicates', 'find errors', 'find blank cells', 'find out why my totals are off', 'find the average',
    // selection that is not a cell, range, column or row
    'select everything', 'select the total row', 'show me a chart', 'show me the data in column B',
    // places, not values
    'go to the next sheet', 'go to the top', 'go to sheet 2',
    // too long to be a cell value
    'where is the money I spent on the car last summer',
    // not navigation at all
    'highlight rent', 'sum column C', 'what is the total', 'hello',
  ])('defers: %s', (message) => {
    expect(parseNavigationRequest(message)).toBeNull()
  })
})

describe('first-session corpus', () => {
  const rows = FIRST_SESSION_CORPUS.filter((c) => c.navigates)
  it('marks the find / go-to / select prompts', () => {
    expect(rows.length).toBeGreaterThanOrEqual(9)
  })
  it.each(rows.map((c) => c.prompt))('navigates: %s', (prompt) => {
    expect(parseNavigationRequest(prompt)).not.toBeNull()
  })
  it('leaves every other corpus prompt to the rest of the pipeline', () => {
    const claimed = FIRST_SESSION_CORPUS.filter((c) => !c.navigates && parseNavigationRequest(c.prompt))
    expect(claimed.map((c) => c.prompt)).toEqual([])
  })
})

describe('findCells', () => {
  it('prefers whole words: "rent" finds Rent and "Monthly rent", not "Current"', () => {
    expect(findCells(budget, 'rent', valueOf(budget))).toEqual(['A3', 'A5'])
  })

  it('falls back to substrings when no whole word matches', () => {
    expect(findCells(budget, 'curr', valueOf(budget))).toEqual(['A2'])
  })

  it('finds numbers and returns reading order', () => {
    expect(findCells(budget, '15', valueOf(budget))).toEqual(['B4', 'B6'])
    expect(findCells(budget, 'netflix', valueOf(budget))).toEqual(['A4', 'A6'])
  })
})

describe('resolveNavigation', () => {
  it('names the single match and its value', () => {
    const out = resolveNavigation({ kind: 'find', text: 'deposit' }, budget, valueOf(budget))
    expect(out.selections).toEqual([{ startRow: 4, startCol: 0, endRow: 4, endCol: 0 }])
    expect(out.message).toBe('Found **deposit** in **A5** ("Monthly rent deposit").')
  })

  it('selects every match and lists them', () => {
    const out = resolveNavigation({ kind: 'find', text: 'netflix' }, budget, valueOf(budget))
    expect(out.selections).toHaveLength(2)
    expect(out.message).toBe('Found **netflix** in 2 cells: A4, A6. All are selected. Showing **A4**.')
  })

  it('says which other sheet has it when this one does not', () => {
    const other = makeSheet({ A1: 'Groceries', B1: 300 }, 'March')
    const out = resolveNavigation({ kind: 'find', text: 'groceries' }, budget, valueOf(budget), [other])
    expect(out.selections).toEqual([])
    expect(out.message).toContain("isn't on this sheet. It's on **March** (A1)")
  })

  it('reports a miss without selecting anything', () => {
    const out = resolveNavigation({ kind: 'find', text: 'gym' }, budget, valueOf(budget))
    expect(out).toEqual({ selections: [], message: "I couldn't find **gym** on this sheet." })
  })

  it('selects a whole column or row over the used part of the sheet', () => {
    expect(resolveNavigation({ kind: 'range', range: 'column:B' }, budget, valueOf(budget)).selections)
      .toEqual([{ startRow: 0, startCol: 1, endRow: 6, endCol: 1 }])
    expect(resolveNavigation({ kind: 'range', range: 'row:3' }, budget, valueOf(budget)).selections)
      .toEqual([{ startRow: 2, startCol: 0, endRow: 2, endCol: 1 }])
  })
})

describe('select_cells tool', () => {
  function ctxFor(sheet: SheetData) {
    const selectRanges = vi.fn()
    const ctx = {
      getActiveSheet: () => sheet,
      getSheets: () => [sheet],
      getComputedValue: valueOf(sheet),
      selectRanges,
      pushHistory: vi.fn(),
    } as unknown as ExecutionContext
    return { ctx, selectRanges }
  }

  it('selects and reveals without modifying cells or recording history', () => {
    const { ctx, selectRanges } = ctxFor(budget)
    const result = executeTool({ tool: 'select_cells', params: { find: 'Rent' }, description: '' }, ctx)
    expect(result).toMatchObject({ success: true, modified: 0 })
    expect(selectRanges).toHaveBeenCalledWith([
      { startRow: 2, startCol: 0, endRow: 2, endCol: 0 },
      { startRow: 4, startCol: 0, endRow: 4, endCol: 0 },
    ])
    expect(ctx.pushHistory).not.toHaveBeenCalled()
  })

  it('accepts A1 text and the parser specs for range', () => {
    expect(navigationRequestFromParams({ range: 'b2:c4' })).toEqual({ kind: 'range', range: 'B2:C4' })
    expect(navigationRequestFromParams({ range: 'column B' })).toEqual({ kind: 'range', range: 'column:B' })
    expect(navigationRequestFromParams({ range: 'column:B' })).toEqual({ kind: 'range', range: 'column:B' })
    expect(navigationRequestFromParams({ range: 'row:5' })).toEqual({ kind: 'range', range: 'row:5' })
    expect(navigationRequestFromParams({ range: 'nonsense' })).toBeNull()
  })

  it('asks for a target when given none', () => {
    const { ctx, selectRanges } = ctxFor(budget)
    const result = executeTool({ tool: 'select_cells', params: {}, description: '' }, ctx)
    expect(result.success).toBe(false)
    expect(selectRanges).not.toHaveBeenCalled()
  })
})
