import { describe, expect, it, vi } from 'vitest'
import { createEmptySheet, refToCell } from '@/engine/spreadsheet'
import { handleCountRows } from './queryOps'
import type { ExecutionContext } from '../executor'

function makeCtx(sheet: ReturnType<typeof createEmptySheet>): ExecutionContext {
  return {
    getActiveSheet: () => sheet,
    getSheets: () => [sheet],
    getComputedValue: (row, col) => {
      const cell = sheet.cells[refToCell(row, col)]
      if (cell?.value == null) return ''
      return String(cell.value)
    },
    setCellValue: () => {},
    setCellFormat: () => {},
    bulkSetCells: () => {},
    applySortPatch: () => {},
    setFilters: () => {},
    deleteRow: () => {},
    insertRow: () => {},
    addSheet: () => {},
    renameSheet: () => ({ ok: true }),
    pushHistory: vi.fn(),
  }
}

describe('handleCountRows — is_number', () => {
  // Header in row 1 (col A/B), numeric and text data below.
  function mixedSheet() {
    const sheet = createEmptySheet('S')
    sheet.cells = {
      A1: { value: 'Label' }, B1: { value: 'Amount' },
      A2: { value: 'a' }, B2: { value: 100 },
      A3: { value: 'b' }, B3: { value: 'pending' },
      A4: { value: 'c' }, B4: { value: '$1,200' },
      A5: { value: 'd' }, B5: { value: '' },
    }
    return sheet
  }

  it('counts only numeric cells in a column with no comparison value', () => {
    const sheet = mixedSheet()
    const result = handleCountRows({ column: 'B', operator: 'is_number' }, makeCtx(sheet), sheet)
    expect(result.success).toBe(true)
    // B2 (100) and B4 ($1,200) are numeric; 'pending' and blank are not.
    expect(result.message).toMatch(/Found 2 matching rows/)
  })

  it('does not require a comparison value for is_number', () => {
    const sheet = mixedSheet()
    const result = handleCountRows({ column: 'B', operator: 'is_number' }, makeCtx(sheet), sheet)
    expect(result.success).toBe(true)
    expect(result.message).not.toMatch(/requires a comparison value/)
  })
})
