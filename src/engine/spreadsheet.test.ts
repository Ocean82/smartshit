/**
 * Regression tests for the calculation engine.
 *
 * These cover defects found in the 2026-07-24 review of src/engine — see
 * docs/agent-engine-code-review.md.
 */

import { describe, it, expect } from 'vitest'
import {
  SpreadsheetEngine,
  colToLetter,
  letterToCol,
  cellToRef,
  tryCellToRef,
  refToCell,
  computedValueToString,
} from './spreadsheet'
import { runAudit } from '@/auditor'
import type { SheetData, WorkbookData } from '@/types'

function sheet(id: string, name: string, cells: SheetData['cells']): SheetData {
  return { id, name, cells, columnWidths: {}, rowHeights: {}, charts: [] } as SheetData
}

function workbook(sheets: SheetData[]): WorkbookData {
  return {
    id: 'wb',
    name: 'wb',
    sheets,
    activeSheetId: sheets[0]?.id ?? '',
    createdAt: 0,
    updatedAt: 0,
  } as WorkbookData
}

describe('coordinate helpers', () => {
  it('round-trips column indices well past Z', () => {
    for (let i = 0; i < 800; i++) {
      expect(letterToCol(colToLetter(i))).toBe(i)
    }
  })

  it('resolves multi-letter columns', () => {
    expect(letterToCol('A')).toBe(0)
    expect(letterToCol('Z')).toBe(25)
    expect(letterToCol('AA')).toBe(26)
    expect(letterToCol('BC')).toBe(54)
  })

  it('accepts lowercase cell ids', () => {
    expect(cellToRef('b2')).toEqual({ row: 1, col: 1 })
    expect(cellToRef('aa10')).toEqual({ row: 9, col: 26 })
  })

  it('tryCellToRef reports malformed input instead of silently returning A1', () => {
    expect(tryCellToRef('garbage')).toBeNull()
    expect(tryCellToRef('')).toBeNull()
    expect(tryCellToRef('A0')).toBeNull()
    expect(tryCellToRef('A1')).toEqual({ row: 0, col: 0 })
  })

  it('refToCell is the inverse of cellToRef', () => {
    for (const id of ['A1', 'B7', 'Z99', 'AA1', 'BC23']) {
      const ref = cellToRef(id)
      expect(refToCell(ref.row, ref.col)).toBe(id)
    }
  })
})

describe('computedValueToString', () => {
  it('preserves the Excel error code from a DetailedCellError', () => {
    expect(computedValueToString({ value: '#DIV/0!', type: 'DIV_BY_ZERO' })).toBe('#DIV/0!')
    expect(computedValueToString({ value: '#NAME?', type: 'NAME' })).toBe('#NAME?')
  })

  it('falls back to #ERROR! for objects with no code', () => {
    expect(computedValueToString({})).toBe('#ERROR!')
  })

  it('maps empty values to an empty string', () => {
    expect(computedValueToString(null)).toBe('')
    expect(computedValueToString(undefined)).toBe('')
  })

  it('stringifies plain values', () => {
    expect(computedValueToString(42)).toBe('42')
    expect(computedValueToString('hi')).toBe('hi')
  })
})

describe('getComputedValue surfaces real formula errors', () => {
  it('returns specific Excel error codes, not a generic #ERROR!', () => {
    const engine = new SpreadsheetEngine()
    const s = sheet('s1', 'S', {
      A1: { value: 10 },
      A2: { value: 0 },
      B1: { value: null, formula: '=A1/A2' },
      B2: { value: null, formula: '=NOSUCHFN(A1)' },
    })
    engine.loadWorkbook(workbook([s]))

    expect(engine.getComputedValue('s1', 0, 1)).toBe('#DIV/0!')
    expect(engine.getComputedValue('s1', 1, 1)).toBe('#NAME?')
    engine.destroy()
  })

  /**
   * The auditor's error-cell rule matches specific Excel codes. When the engine
   * flattened every error to "#ERROR!" the rule matched nothing and a broken
   * spreadsheet was reported as clean with a perfect health score.
   */
  it('lets the auditor detect broken formulas end-to-end', () => {
    const engine = new SpreadsheetEngine()
    const s = sheet('s1', 'S', {
      A1: { value: 10 },
      A2: { value: 0 },
      B1: { value: null, formula: '=A1/A2' },
      B2: { value: null, formula: '=NOSUCHFN(A1)' },
    })
    engine.loadWorkbook(workbook([s]))

    const result = runAudit(s, (r, c) => engine.getComputedValue('s1', r, c))
    const errorFindings = result.findings.filter((f) => f.ruleId === 'error-cells')

    expect(errorFindings).toHaveLength(2)
    expect(result.score).toBeLessThan(100)
    expect(result.summary).not.toContain('No issues found')
    engine.destroy()
  })
})

describe('engine lifecycle', () => {
  it('gives each engine an isolated AI registry', () => {
    const first = new SpreadsheetEngine()
    const second = new SpreadsheetEngine()

    expect(second.aiRegistry.has('AI.CATEGORIZE')).toBe(true)
    first.destroy()
    // Disposing one engine must not unregister functions used by another
    expect(second.aiRegistry.has('AI.CATEGORIZE')).toBe(true)
    second.destroy()
  })

  it('keeps sheets with duplicate names readable', () => {
    const engine = new SpreadsheetEngine()
    engine.loadWorkbook(
      workbook([
        sheet('s1', 'Sheet 1', { A1: { value: 1 } }),
        sheet('s2', 'Sheet 1', { A1: { value: 99 } }),
      ]),
    )

    expect(engine.getComputedValue('s1', 0, 0)).toBe('1')
    expect(engine.getComputedValue('s2', 0, 0)).toBe('99')
    engine.destroy()
  })
})

describe('getFunctionInfo', () => {
  it('resolves built-in and AI functions', () => {
    const engine = new SpreadsheetEngine()
    expect(engine.getFunctionInfo('SUM')?.name).toBe('SUM')
    expect(engine.getFunctionInfo('ai.categorize')?.name).toBe('AI.CATEGORIZE')
    expect(engine.getFunctionInfo('NOT_A_FUNCTION')).toBeNull()
    engine.destroy()
  })
})
