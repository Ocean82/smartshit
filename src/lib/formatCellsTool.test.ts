import { describe, expect, it } from 'vitest'
import {
  expandRange,
  normalizeCondition,
  cellMatchesCondition,
  findMatchingCellIds,
  buildFormatPatch,
  applyFormatCells,
  type FormatCellsContext,
} from './formatCellsTool'
import type { CellFormat, SheetData } from '@/types'
import { cellToRef } from '@/engine/spreadsheet'

function makeSheet(cells: Record<string, string | number>): SheetData {
  const sheetCells: SheetData['cells'] = {}
  for (const [id, value] of Object.entries(cells)) {
    sheetCells[id] = { value }
  }
  return {
    id: 's1',
    name: 'Sheet 1',
    cells: sheetCells,
    columnWidths: {},
    rowHeights: {},
  }
}

function makeContext(sheet: SheetData, selection: string[] = []) {
  const formats: Record<string, Partial<CellFormat>> = {}
  const ctx: FormatCellsContext = {
    getActiveSheet: () => sheet,
    getComputedValue: (row, col) => {
      for (const [id, cell] of Object.entries(sheet.cells)) {
        const ref = cellToRef(id)
        if (ref.row === row && ref.col === col) return String(cell.value ?? '')
      }
      return ''
    },
    setCellFormat: (cellId, format) => {
      formats[cellId] = { ...formats[cellId], ...format }
    },
    pushHistory: () => {},
    getSelection: () => selection,
  }
  return { ctx, formats }
}

describe('expandRange', () => {
  const sheet = makeSheet({ A1: 'Name', B1: 'Amount', B2: 4, B3: 14, AB2: 7 })

  it('expands rectangular ranges', () => {
    expect(expandRange('B2:B4', sheet)).toEqual(['B2', 'B3', 'B4'])
    expect(expandRange('A1:B2', sheet)).toEqual(['A1', 'B1', 'A2', 'B2'])
  })

  it('handles multi-letter columns', () => {
    expect(expandRange('AB2:AB3', sheet)).toEqual(['AB2', 'AB3'])
    expect(expandRange('AB', sheet)).toEqual(['AB2'])
  })

  it('expands column specs to populated cells only', () => {
    expect(expandRange('B', sheet)?.sort()).toEqual(['B1', 'B2', 'B3'])
    expect(expandRange('B:B', sheet)?.sort()).toEqual(['B1', 'B2', 'B3'])
  })

  it('handles single cells and rejects garbage', () => {
    expect(expandRange('b3', sheet)).toEqual(['B3'])
    expect(expandRange('not a range', sheet)).toBeNull()
  })
})

describe('normalizeCondition', () => {
  it('accepts the canonical shape', () => {
    expect(normalizeCondition({ operator: 'contains', value: '4' }))
      .toEqual({ operator: 'contains', value: '4' })
    expect(normalizeCondition({ operator: 'eq', value: 4 }))
      .toEqual({ operator: 'eq', value: 4 })
  })

  it('accepts shorthand LLM shapes', () => {
    expect(normalizeCondition({ contains: '7' })).toEqual({ operator: 'contains', value: '7' })
    expect(normalizeCondition({ gt: 500 })).toEqual({ operator: 'gt', value: 500 })
    expect(normalizeCondition({ equals: 0 })).toEqual({ operator: 'eq', value: 0 })
  })

  it('accepts bare negative/positive strings and rejects junk', () => {
    expect(normalizeCondition('negative')).toEqual({ operator: 'negative' })
    expect(normalizeCondition('nonsense')).toBeNull()
    expect(normalizeCondition(42)).toBeNull()
    expect(normalizeCondition(null)).toBeNull()
  })
})

describe('cellMatchesCondition', () => {
  it('contains matches substrings of the display value', () => {
    const cond = { operator: 'contains' as const, value: '4' }
    expect(cellMatchesCondition('4', cond)).toBe(true)
    expect(cellMatchesCondition('14', cond)).toBe(true)
    expect(cellMatchesCondition('Room 4', cond)).toBe(true)
    expect(cellMatchesCondition('55', cond)).toBe(false)
  })

  it('eq compares parsed numbers, not substrings', () => {
    const cond = { operator: 'eq' as const, value: 4 }
    expect(cellMatchesCondition('4', cond)).toBe(true)
    expect(cellMatchesCondition('$4', cond)).toBe(true)
    expect(cellMatchesCondition('14', cond)).toBe(false)
  })

  it('eq falls back to text equality for non-numeric values', () => {
    const cond = { operator: 'eq' as const, value: 'Pending' }
    expect(cellMatchesCondition('pending', cond)).toBe(true)
    expect(cellMatchesCondition('Done', cond)).toBe(false)
  })

  it('handles numeric comparisons and negative/positive', () => {
    expect(cellMatchesCondition('600', { operator: 'gt', value: 500 })).toBe(true)
    expect(cellMatchesCondition('400', { operator: 'gt', value: 500 })).toBe(false)
    expect(cellMatchesCondition('-3', { operator: 'negative' })).toBe(true)
    expect(cellMatchesCondition('abc', { operator: 'negative' })).toBe(false)
  })
})

describe('applyFormatCells', () => {
  it('highlights only matching cells in an explicit range (eq 4)', () => {
    const sheet = makeSheet({ B2: 4, B3: 14, B4: 4, B5: 9 })
    const { ctx, formats } = makeContext(sheet)

    const result = applyFormatCells(
      { range: 'B2:B10', condition: { operator: 'eq', value: 4 }, bgColor: '#FFF9C4' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(result.modified).toBe(2)
    expect(Object.keys(formats).sort()).toEqual(['B2', 'B4'])
    expect(formats.B2.bgColor).toBe('#FFF9C4')
  })

  it('contains "4" matches 14, 4, and Room 4 across the sheet', () => {
    const sheet = makeSheet({ A1: 'Room 4', B2: 14, C3: 4, D4: 'nope' })
    const { ctx, formats } = makeContext(sheet)

    const result = applyFormatCells(
      { condition: { operator: 'contains', value: '4' }, bgColor: '#FFF9C4' },
      ctx,
    )

    expect(result.modified).toBe(3)
    expect(Object.keys(formats).sort()).toEqual(['A1', 'B2', 'C3'])
  })

  it('applies fontColor via setCellFormat ("change text to red")', () => {
    const sheet = makeSheet({ A1: 'Hello', B1: 'World' })
    const { ctx, formats } = makeContext(sheet)

    const result = applyFormatCells({ fontColor: '#FF0000' }, ctx)

    expect(result.success).toBe(true)
    expect(formats.A1.fontColor).toBe('#FF0000')
    expect(formats.B1.fontColor).toBe('#FF0000')
  })

  it('prefers the selection when no range is given and no condition', () => {
    const sheet = makeSheet({ A1: 'x', B1: 'y', C1: 'z' })
    const { ctx, formats } = makeContext(sheet, ['B1'])

    applyFormatCells({ bold: true }, ctx)

    expect(Object.keys(formats)).toEqual(['B1'])
    expect(formats.B1.bold).toBe(true)
  })

  it('ignores a single-cell cursor selection when scanning with a condition', () => {
    const sheet = makeSheet({ A1: 4, B5: 4, C9: 7 })
    const { ctx, formats } = makeContext(sheet, ['A1'])

    const result = applyFormatCells(
      { condition: { operator: 'eq', value: 4 }, bgColor: '#FFF9C4' },
      ctx,
    )

    expect(result.modified).toBe(2)
    expect(Object.keys(formats).sort()).toEqual(['A1', 'B5'])
  })

  it('returns failure with a clear message when nothing matches', () => {
    const sheet = makeSheet({ A1: 1, A2: 2 })
    const { ctx, formats } = makeContext(sheet)

    const result = applyFormatCells(
      { condition: { operator: 'eq', value: 99 }, bgColor: '#FFF9C4' },
      ctx,
    )

    expect(result.success).toBe(false)
    expect(result.modified).toBe(0)
    expect(result.message).toMatch(/no cells matched/i)
    expect(Object.keys(formats)).toEqual([])
  })

  it('fails when no style params are provided', () => {
    const sheet = makeSheet({ A1: 1 })
    const { ctx } = makeContext(sheet)

    const result = applyFormatCells({ range: 'A1' }, ctx)
    expect(result.success).toBe(false)
  })

  it('buildFormatPatch collects only provided styles', () => {
    expect(buildFormatPatch({ bold: true, fontColor: '#FF0000' }))
      .toEqual({ bold: true, fontColor: '#FF0000' })
    expect(buildFormatPatch({})).toBeNull()
  })

  it('findMatchingCellIds filters candidates by computed value', () => {
    const sheet = makeSheet({ A1: 4, A2: 5 })
    const { ctx } = makeContext(sheet)
    const matches = findMatchingCellIds(
      sheet,
      ['A1', 'A2'],
      { operator: 'eq', value: 4 },
      ctx.getComputedValue,
    )
    expect(matches).toEqual(['A1'])
  })
})
