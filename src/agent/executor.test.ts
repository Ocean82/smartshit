/**
 * Regression tests for the agent executor.
 * See docs/agent-engine-code-review.md (C2, C3, H2, H3, L1).
 */

import { describe, it, expect } from 'vitest'
import { executeTool, type ExecutionContext } from './executor'
import { refToCell } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'

interface Harness {
  ctx: ExecutionContext
  writes: Array<{ cell: string; value: unknown; formula?: string }>
  deletions: number[]
  exports: string[]
  bulkCalls: () => number
}

function harness(cells: SheetData['cells'] = {}): Harness {
  const sheet = {
    id: 's1',
    name: 'Sheet 1',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  } as SheetData

  const writes: Harness['writes'] = []
  const deletions: number[] = []
  const exports: string[] = []
  let bulkCalls = 0

  const ctx = {
    getActiveSheet: () => sheet,
    getComputedValue: (row: number, col: number) => {
      const value = sheet.cells[refToCell(row, col)]?.value
      return value == null ? '' : String(value)
    },
    setCellValue: (cell, value, formula) => writes.push({ cell, value, formula }),
    bulkSetCells: (updates) => {
      bulkCalls++
      for (const [cell, { value, formula }] of Object.entries(updates)) {
        writes.push({ cell, value, formula })
      }
    },
    setCellFormat: () => {},
    applySortPatch: () => {},
    setFilters: () => {},
    deleteRow: (row) => deletions.push(row),
    insertRow: () => {},
    addSheet: () => {},
    renameSheet: () => {},
    pushHistory: () => {},
    exportData: (format) => exports.push(format),
    getSheets: () => [],
  } as ExecutionContext

  return { ctx, writes, deletions, exports, bulkCalls: () => bulkCalls }
}

const run = (h: Harness, tool: string, params: Record<string, unknown>) =>
  executeTool({ tool, params, description: '' }, h.ctx)

describe('parameter validation', () => {
  it('returns a failure instead of throwing when params are missing', () => {
    const tools = [
      'set_cell', 'set_range', 'add_row', 'rename_header', 'modify_column',
      'sort_sheet', 'find_and_replace', 'find_max', 'find_min', 'rename_sheet',
    ]
    for (const tool of tools) {
      const h = harness()
      const result = run(h, tool, {})
      expect(result.success, `${tool} should fail cleanly`).toBe(false)
      expect(result.modified).toBe(0)
    }
  })

  it('rejects malformed cell references', () => {
    const h = harness()
    expect(run(h, 'set_cell', { cell: 'not-a-cell', value: '1' }).success).toBe(false)
  })

  it('accepts numeric and boolean values for set_cell', () => {
    const h = harness()
    expect(run(h, 'set_cell', { cell: 'A1', value: 42 }).success).toBe(true)
    expect(h.writes[0]).toMatchObject({ cell: 'A1', value: 42 })

    const h2 = harness()
    expect(run(h2, 'set_cell', { cell: 'A1', value: true }).success).toBe(true)
  })

  it('still stores formulas passed as strings', () => {
    const h = harness()
    run(h, 'set_cell', { cell: 'A1', value: '=SUM(B1:B2)' })
    expect(h.writes[0]).toMatchObject({ cell: 'A1', formula: '=SUM(B1:B2)' })
  })
})

describe('find_and_replace', () => {
  it('treats regex metacharacters literally instead of throwing', () => {
    const h = harness({ A1: { value: 'total (net)' } })
    const result = run(h, 'find_and_replace', { find: '(', replace: '[' })
    expect(result.success).toBe(true)
    expect(h.writes[0]?.value).toBe('total [net)')
  })

  it('does not treat "." as a wildcard', () => {
    const h = harness({ A1: { value: '3.14' } })
    run(h, 'find_and_replace', { find: '.', replace: '_' })
    expect(h.writes[0]?.value).toBe('3_14')
  })

  it('handles "+" without error', () => {
    const h = harness({ A1: { value: 'a+b' } })
    const result = run(h, 'find_and_replace', { find: '+', replace: '-' })
    expect(result.success).toBe(true)
    expect(h.writes[0]?.value).toBe('a-b')
  })

  it('never overwrites a formula with its rendered value', () => {
    const h = harness({
      A1: { value: 100, formula: '=B1*2' },
      A2: { value: '100 units' },
    })
    const result = run(h, 'find_and_replace', { find: '100', replace: '200' })
    expect(h.writes.map((w) => w.cell)).toEqual(['A2'])
    expect(result.message).toContain('skipped 1 formula cell')
  })

  it('requires a find value', () => {
    const h = harness({ A1: { value: 'x' } })
    expect(run(h, 'find_and_replace', { find: '', replace: 'y' }).success).toBe(false)
  })
})

describe('multi-letter columns', () => {
  it('modify_column targets AA rather than A', () => {
    const h = harness({ A1: { value: 1 }, AA1: { value: 5 } })
    run(h, 'modify_column', { column: 'AA', operation: 'multiply', factor: 2 })
    expect(h.writes).toEqual([{ cell: 'AA1', value: 10, formula: undefined }])
  })

  it('find_max reads the requested column', () => {
    const h = harness({ AA1: { value: 5 }, AA2: { value: 9 } })
    const result = run(h, 'find_max', { column: 'AA' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('column AA')
    expect(result.message).toContain('9')
    expect(result.message).not.toContain('[object Object]')
  })

  it('find_max excludes aggregate total rows', () => {
    const h = harness({
      A1: { value: 'Item' }, B1: { value: 'Amount' },
      A2: { value: 'Rent' }, B2: { value: 1500 },
      A3: { value: 'Food' }, B3: { value: 400 },
      A4: { value: 'Total Expenses' }, B4: { value: 1900, formula: '=SUM(B2:B3)' },
    })
    const result = run(h, 'find_max', { column: 'Amount' })
    expect(result.message).toContain('$1,500')
    expect(result.message).toContain('Rent')
    expect(result.message).not.toContain('$1,900')
  })

  it('resolves a column by header name', () => {
    const h = harness({
      A1: { value: 'Item' }, B1: { value: 'Amount' },
      A2: { value: 'rent' }, B2: { value: 100 },
    })
    const result = run(h, 'modify_column', { column: 'Amount', operation: 'add', factor: 5 })
    expect(result.success).toBe(true)
    expect(h.writes).toContainEqual({ cell: 'B2', value: 105, formula: undefined })
  })

  it('resolves a short header before interpreting it as a column letter', () => {
    const h = harness({
      A1: { value: 'Item' }, B1: { value: 'Tax' },
      A2: { value: 'rent' }, B2: { value: 10 },
    })
    const result = run(h, 'modify_column', { column: 'Tax', operation: 'add', factor: 5 })
    expect(result.success).toBe(true)
    expect(h.writes).toContainEqual({ cell: 'B2', value: 15, formula: undefined })
  })

  it('fails clearly when a column cannot be resolved', () => {
    const h = harness({ A1: { value: 'Item' } })
    expect(run(h, 'modify_column', { column: 'Nonexistent', operation: 'add', factor: 1 }).success).toBe(false)
  })

  it('refuses to divide by zero', () => {
    const h = harness({ A1: { value: 10 } })
    expect(run(h, 'modify_column', { column: 'A', operation: 'divide', factor: 0 }).success).toBe(false)
  })
})

describe('apply_formula ranges', () => {
  it('includes the first row when the sheet has no header', () => {
    const h = harness({ B1: { value: 10 }, B2: { value: 20 }, B3: { value: 30 } })
    run(h, 'apply_formula', { cell: 'B', formula: '=SUM' })
    expect(h.writes[0]).toMatchObject({ cell: 'B4', formula: '=SUM(B1:B3)' })
  })

  it('skips the header row when one is present', () => {
    const h = harness({
      A1: { value: 'Item' }, B1: { value: 'Amount' },
      A2: { value: 'a' }, B2: { value: 10 },
      A3: { value: 'b' }, B3: { value: 20 },
    })
    run(h, 'apply_formula', { cell: 'B', formula: '=SUM' })
    expect(h.writes[0]).toMatchObject({ cell: 'B4', formula: '=SUM(B2:B3)' })
  })

  it('supports multi-letter target columns', () => {
    const h = harness({ AA1: { value: 1 }, AA2: { value: 2 } })
    run(h, 'apply_formula', { cell: 'AA', formula: '=SUM' })
    expect(h.writes[0]?.formula).toBe('=SUM(AA1:AA2)')
  })

  it('fails on an empty column', () => {
    const h = harness({ A1: { value: 1 } })
    expect(run(h, 'apply_formula', { cell: 'C', formula: '=SUM' }).success).toBe(false)
  })

  it('writes an explicit formula to a cell reference unchanged', () => {
    const h = harness({})
    run(h, 'apply_formula', { cell: 'D4', formula: '=AVERAGE(A1:A3)' })
    expect(h.writes[0]).toMatchObject({ cell: 'D4', formula: '=AVERAGE(A1:A3)' })
  })
})

describe('batched writes', () => {
  it('clear_sheet issues a single bulk update', () => {
    const cells: SheetData['cells'] = {}
    for (let row = 0; row < 200; row++) cells[refToCell(row, 0)] = { value: row }
    const h = harness(cells)

    const result = run(h, 'clear_sheet', {})
    expect(result.modified).toBe(200)
    expect(h.bulkCalls()).toBe(1)
  })

  it('add_row and set_range also batch', () => {
    const h = harness()
    run(h, 'add_row', { values: ['a', 1, '=A1'] })
    expect(h.bulkCalls()).toBe(1)

    const h2 = harness()
    run(h2, 'set_range', { startCell: 'A1', values: [[1, 2], [3, 4]] })
    expect(h2.bulkCalls()).toBe(1)
    expect(h2.writes).toHaveLength(4)
  })
})

describe('read-only local tools', () => {
  it('counts matching rows once even when searching the whole row', () => {
    const h = harness({
      A1: { value: 'Task' }, B1: { value: 'Status' }, C1: { value: 'Note' },
      A2: { value: 'Invoice' }, B2: { value: 'Overdue' }, C2: { value: 'overdue' },
      A3: { value: 'Report' }, B3: { value: 'Done' },
      A4: { value: 'Tax' }, B4: { value: 'Overdue' },
    })
    const result = run(h, 'count_rows', { operator: 'equals', value: 'overdue' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Found 2 matching rows')
    expect(result.modified).toBe(0)
  })

  it('counts numeric comparisons in a resolved column without counting totals', () => {
    const h = harness({
      A1: { value: 'Item' }, D1: { value: 'Amount' },
      A2: { value: 'A' }, D2: { value: 100 },
      A3: { value: 'B' }, D3: { value: 600 },
      A4: { value: 'C' }, D4: { value: 900 },
      A5: { value: 'Total' }, D5: { value: 1600 },
    })
    const result = run(h, 'count_rows', { column: 'Amount', operator: 'gt', value: 500 })
    expect(result.message).toContain('Found 2 matching rows in Amount')
  })

  it('delegates export to the existing application handler', () => {
    const h = harness()
    const result = run(h, 'export_data', { format: 'csv' })
    expect(result.success).toBe(true)
    expect(h.exports).toEqual(['csv'])
  })
})

describe('delete row validation', () => {
  it('resolves a named row, skips the matching header, and deletes exact preview row', () => {
    const h = harness({
      A1: { value: 'Netflix' }, B1: { value: 'Amount' },
      A2: { value: 'Netflix' }, B2: { value: 15 },
    })
    const result = run(h, 'delete_row', { match: 'Netflix' })
    expect(result.success).toBe(true)
    expect(h.deletions).toEqual([1])
  })

  it('rejects a row outside the populated sheet', () => {
    const h = harness({ A1: { value: 'Header' }, A2: { value: 'Value' } })
    expect(run(h, 'delete_row', { row: 99 }).success).toBe(false)
    expect(h.deletions).toEqual([])
  })

  it('refuses a confirmed deletion when the previewed row has changed', () => {
    const cells: SheetData['cells'] = {
      A1: { value: 'Item' }, B1: { value: 'Amount' },
      A2: { value: 'Netflix' }, B2: { value: 15 },
    }
    const h = harness(cells)
    const signature = JSON.stringify(['Netflix', '15'])
    cells.B2.value = 25

    const result = run(h, 'delete_row', { row: 2, expectedRowSignature: signature })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/changed after the preview/i)
    expect(h.deletions).toEqual([])
  })
})

describe('multi-sort validation', () => {
  it('does not silently map an unknown sort column to column A', () => {
    const h = harness({ A1: { value: 'Item' }, A2: { value: 'Rent' } })
    const result = run(h, 'multi_sort', { rules: [{ column: 'Missing', direction: 'asc' }] })
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Could not resolve/i)
  })
})

describe('unknown tools', () => {
  it('reports rather than throws', () => {
    const h = harness()
    const result = run(h, 'no_such_tool', {})
    expect(result.success).toBe(false)
    expect(result.message).toContain('Unknown tool')
  })
})
