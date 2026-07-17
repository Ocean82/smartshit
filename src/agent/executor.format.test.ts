import { describe, expect, it } from 'vitest'
import { parseMessage } from './parser'
import { executeTool, type ExecutionContext } from './executor'
import type { CellFormat, FilterConfig, SheetData } from '@/types'
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

function makeContext(sheet: SheetData) {
  const formats: Record<string, Partial<CellFormat>> = {}
  const filterCalls: FilterConfig[][] = []
  const templateCalls: Array<{ tool: string; params: Record<string, unknown> }> = []

  const ctx: ExecutionContext = {
    getActiveSheet: () => sheet,
    getComputedValue: (row, col) => {
      for (const [id, cell] of Object.entries(sheet.cells)) {
        const ref = cellToRef(id)
        if (ref.row === row && ref.col === col) return String(cell.value ?? '')
      }
      return ''
    },
    setCellValue: (cellId, value) => {
      sheet.cells[cellId] = { value }
    },
    setCellFormat: (cellId, format) => {
      formats[cellId] = { ...formats[cellId], ...format }
    },
    bulkSetCells: () => {},
    applySortPatch: () => {},
    setFilters: (filters) => filterCalls.push(filters),
    deleteRow: () => {},
    insertRow: () => {},
    addSheet: () => {},
    renameSheet: () => {},
    pushHistory: () => {},
    getSelection: () => [],
    executeTemplate: (tool, params) => {
      templateCalls.push({ tool, params })
      return { success: true, message: `Built ${tool}`, modified: 0 }
    },
  }
  return { ctx, formats, filterCalls, templateCalls }
}

describe('fast path: parser → executor formatting', () => {
  it('"highlight cells containing 4" highlights only matching cells', () => {
    const sheet = makeSheet({ A1: 'Item', B1: 'Qty', A2: 'Chairs', B2: 4, A3: 'Desks', B3: 7, A4: 'Room 4', B4: 12 })
    const { ctx, formats } = makeContext(sheet)

    const parsed = parseMessage('highlight cells containing 4')
    expect(parsed.understood).toBe(true)

    const results = parsed.calls.map((call) => executeTool(call, ctx))
    expect(results.every((r) => r.success)).toBe(true)
    // B2 (4), A4 (Room 4) match; B4 (12) and B3 (7) do not
    expect(Object.keys(formats).sort()).toEqual(['A4', 'B2'])
    expect(formats.B2.bgColor).toBeTruthy()
  })

  it('"change the text to red" applies fontColor, never find/replace', () => {
    const sheet = makeSheet({ A1: 'Hello', B1: 'World' })
    const { ctx, formats } = makeContext(sheet)

    const parsed = parseMessage('change the text to red')
    expect(parsed.calls[0].tool).toBe('format_cells')

    const result = executeTool(parsed.calls[0], ctx)
    expect(result.success).toBe(true)
    expect(formats.A1.fontColor).toBe('#FF0000')
    expect(formats.B1.fontColor).toBe('#FF0000')
    // Cell values untouched
    expect(sheet.cells.A1.value).toBe('Hello')
  })
})

describe('Apply path: LLM-style format_cells actions', () => {
  it('applies condition + fontColor to the correct cells', () => {
    const sheet = makeSheet({ B2: 4, B3: 14, B4: 4 })
    const { ctx, formats } = makeContext(sheet)

    const result = executeTool(
      {
        tool: 'format_cells',
        params: { range: 'B2:B4', condition: { operator: 'eq', value: 4 }, fontColor: '#FF0000' },
        description: 'Red font for 4s',
      },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(Object.keys(formats).sort()).toEqual(['B2', 'B4'])
    expect(formats.B2.fontColor).toBe('#FF0000')
  })

  it('accepts the legacy shorthand condition shape {contains: "7"}', () => {
    const sheet = makeSheet({ A1: 7, A2: 17, A3: 5 })
    const { ctx, formats } = makeContext(sheet)

    const result = executeTool(
      { tool: 'format_cells', params: { condition: { contains: '7' }, bgColor: '#DBEAFE' }, description: 'Blue 7s' },
      ctx,
    )

    expect(result.modified).toBe(2)
    expect(Object.keys(formats).sort()).toEqual(['A1', 'A2'])
  })

  it('resolves the conditional_format alias to format_cells', () => {
    const sheet = makeSheet({ B1: 'Amount', B2: -50, B3: 100, B4: -1 })
    const { ctx, formats } = makeContext(sheet)

    const result = executeTool(
      {
        tool: 'conditional_format',
        params: { column: 'B', condition: 'negative', color: '#FEE2E2' },
        description: 'Highlight negatives',
      },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(Object.keys(formats).sort()).toEqual(['B2', 'B4'])
    expect(formats.B2.bgColor).toBe('#FEE2E2')
  })

  it('resolves the format_range alias to format_cells', () => {
    const sheet = makeSheet({ A1: 'Name', B1: 'Amount' })
    const { ctx, formats } = makeContext(sheet)

    const result = executeTool(
      { tool: 'format_range', params: { range: 'A1:B1', bold: true }, description: 'Bold headers' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(formats.A1.bold).toBe(true)
    expect(formats.B1.bold).toBe(true)
  })
})

describe('executor: filter and template delegation', () => {
  it('maps filter params to a FilterConfig via setFilters', () => {
    const sheet = makeSheet({ A1: 'Item', B1: 'Amount', B2: 500 })
    const { ctx, filterCalls } = makeContext(sheet)

    const result = executeTool(
      { tool: 'filter', params: { column: 'B', condition: 'gt', value: 100 }, description: 'Filter > 100' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(filterCalls).toHaveLength(1)
    expect(filterCalls[0][0]).toMatchObject({ column: 1, condition: 'gt', value: 100 })
  })

  it('resolves a header name to its column index', () => {
    const sheet = makeSheet({ A1: 'Item', B1: 'Amount' })
    const { ctx, filterCalls } = makeContext(sheet)

    executeTool(
      { tool: 'filter', params: { column: 'Amount', condition: 'gt', value: 100 }, description: 'Filter' },
      ctx,
    )
    expect(filterCalls[0][0].column).toBe(1)
  })

  it('delegates create_* templates to executeTemplate (no more "Unknown tool")', () => {
    const sheet = makeSheet({})
    const { ctx, templateCalls } = makeContext(sheet)

    const result = executeTool(
      { tool: 'create_budget_template', params: {}, description: 'Budget' },
      ctx,
    )

    expect(result.success).toBe(true)
    expect(templateCalls).toEqual([{ tool: 'create_budget_template', params: {} }])
  })

  it('fails gracefully when templates are unavailable in the context', () => {
    const sheet = makeSheet({})
    const { ctx } = makeContext(sheet)
    delete ctx.executeTemplate

    const result = executeTool({ tool: 'create_invoice', params: {}, description: 'Invoice' }, ctx)
    expect(result.success).toBe(false)
  })
})
