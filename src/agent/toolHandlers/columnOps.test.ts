import { describe, it, expect, vi } from 'vitest'
import { createEmptySheet, refToCell } from '@/engine/spreadsheet'
import { detectApplyFormulaRangeGapRisk, handleApplyFormula } from './columnOps'
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
    setCellValue: (cellId, value, formula) => {
      sheet.cells[cellId] = {
        value: formula ? null : value,
        formula,
      }
    },
    setCellFormat: () => {},
    bulkSetCells: () => {},
    applySortPatch: () => {},
    setFilters: () => {},
    deleteRow: () => {},
    insertRow: () => {},
    addSheet: () => {},
    renameSheet: () => {},
    pushHistory: vi.fn(),
  }
}

describe('detectApplyFormulaRangeGapRisk', () => {
  it('flags SUM ranges that exclude an adjacent numeric cell', () => {
    const sheet = createEmptySheet('S')
    sheet.cells = {
      A1: { value: 10 },
      A2: { value: 20 },
      A3: { value: 30 },
      A4: { value: 40 },
    }
    const risk = detectApplyFormulaRangeGapRisk(
      '=SUM(A1:A3)',
      sheet,
      (row, col) => String(sheet.cells[refToCell(row, col)]?.value ?? ''),
      'A5',
    )
    expect(risk).toContain('A4')
  })

  it('returns null when the range covers adjacent data', () => {
    const sheet = createEmptySheet('S')
    sheet.cells = {
      A1: { value: 10 },
      A2: { value: 20 },
      A3: { value: 30 },
    }
    const risk = detectApplyFormulaRangeGapRisk(
      '=SUM(A1:A3)',
      sheet,
      () => '',
      'A4',
    )
    expect(risk).toBeNull()
  })
})

describe('handleApplyFormula range-gap safety', () => {
  it('blocks gap-risk formulas unless confirmGaps is set', () => {
    const sheet = createEmptySheet('S')
    sheet.cells = {
      A1: { value: 10 },
      A2: { value: 20 },
      A3: { value: 30 },
      A4: { value: 40 },
    }
    const ctx = makeCtx(sheet)
    const blocked = handleApplyFormula(
      { cell: 'A5', formula: '=SUM(A1:A3)' },
      ctx,
      sheet,
    )
    expect(blocked.success).toBe(false)
    expect(blocked.message).toMatch(/range gap risk/i)

    const forced = handleApplyFormula(
      { cell: 'A5', formula: '=SUM(A1:A3)', confirmGaps: true },
      ctx,
      sheet,
    )
    expect(forced.success).toBe(true)
    expect(sheet.cells.A5?.formula).toBe('=SUM(A1:A3)')
  })
})
