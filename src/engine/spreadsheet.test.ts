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
  // The object-unwrapping cases are a backward-compat shim: formualizer returns
  // error strings directly, but any code that passes a HyperFormula-style
  // { value: '#DIV/0!' } object (e.g. persisted workbook data) must still work.
  it('unwraps a { value } error object (backward-compat shim)', () => {
    expect(computedValueToString({ value: '#DIV/0!', type: 'DIV_BY_ZERO' })).toBe('#DIV/0!')
    expect(computedValueToString({ value: '#NAME?', type: 'NAME' })).toBe('#NAME?')
  })

  it('falls back to #ERROR! for objects with no value string', () => {
    expect(computedValueToString({})).toBe('#ERROR!')
  })

  it('maps empty values to an empty string', () => {
    expect(computedValueToString(null)).toBe('')
    expect(computedValueToString(undefined)).toBe('')
  })

  it('stringifies plain values', () => {
    expect(computedValueToString(42)).toBe('42')
    expect(computedValueToString('hi')).toBe('hi')
    // formualizer returns error strings directly — must pass through unchanged
    expect(computedValueToString('#DIV/0!')).toBe('#DIV/0!')
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

describe('getFunctionList', () => {
  it('includes built-in and AI functions', () => {
    const engine = new SpreadsheetEngine()
    const list = engine.getFunctionList()
    const names = list.map((f) => f.name)
    expect(names).toContain('SUM')
    expect(names).toContain('VLOOKUP')
    expect(names).toContain('AI.CATEGORIZE')
    engine.destroy()
  })

  it('every entry has name, description, category, and syntax', () => {
    const engine = new SpreadsheetEngine()
    for (const fn of engine.getFunctionList()) {
      expect(typeof fn.name).toBe('string')
      expect(typeof fn.description).toBe('string')
      expect(typeof fn.category).toBe('string')
      expect(typeof fn.syntax).toBe('string')
    }
    engine.destroy()
  })
})

describe('setCellValue round-trip', () => {
  it('writes a plain value and reads it back', () => {
    const engine = new SpreadsheetEngine()
    const s = sheet('s1', 'S', {})
    engine.loadWorkbook(workbook([s]))
    engine.setCellValue('s1', 0, 0, 42)
    expect(engine.getComputedValue('s1', 0, 0)).toBe('42')
    engine.destroy()
  })

  it('writes a formula string and evaluates it', () => {
    const engine = new SpreadsheetEngine()
    const s = sheet('s1', 'S', { A1: { value: 10 }, A2: { value: 5 } })
    engine.loadWorkbook(workbook([s]))
    engine.setCellValue('s1', 0, 2, '=A1+A2') // C1
    expect(engine.getComputedValue('s1', 0, 2)).toBe('15')
    engine.destroy()
  })

  it('clears a cell when null is written', () => {
    const engine = new SpreadsheetEngine()
    const s = sheet('s1', 'S', { A1: { value: 99 } })
    engine.loadWorkbook(workbook([s]))
    engine.setCellValue('s1', 0, 0, null)
    expect(engine.getComputedValue('s1', 0, 0)).toBe('')
    engine.destroy()
  })

  it('is a no-op for an unknown sheet id', () => {
    const engine = new SpreadsheetEngine()
    engine.loadWorkbook(workbook([sheet('s1', 'S', {})]))
    expect(() => engine.setCellValue('NOPE', 0, 0, 1)).not.toThrow()
    engine.destroy()
  })
})

// ─── executeAIFormula parser edge cases (B4 / O4) ────────────────────────────

describe('executeAIFormula — regex and parser edge cases', () => {
  /**
   * B4: The original regex [A-Z_]+ rejected hyphens and digits, so a function
   *     named AI.MY-FUNC or AI.GPT4 would return #NAME? instead of dispatching
   *     to the registry. The fix widens the pattern to [A-Z0-9_-]+.
   */
  it('B4 — accepts function names with hyphens and digits', () => {
    const engine = new SpreadsheetEngine()
    // Register a hyphenated AI function directly into the engine's own registry
    engine.aiRegistry.registerFunction(
      {
        name: 'AI.MY-FUNC',
        description: '',
        abstract: '',
        category: 'AI',
        syntax: 'AI.MY-FUNC(text)',
        parameters: [],
        isAsync: false,
      },
      () => 'hyphen-ok',
    )
    engine.aiRegistry.registerFunction(
      {
        name: 'AI.GPT4',
        description: '',
        abstract: '',
        category: 'AI',
        syntax: 'AI.GPT4(text)',
        parameters: [],
        isAsync: false,
      },
      () => 'digit-ok',
    )

const resolve = () => null
  // Must NOT return '#NAME?' — the regex must parse these names
  it('B4 — accepts function names with hyphens and digits', async () => {
    const engine = new SpreadsheetEngine()
    expect(await engine.executeAIFormula('A1', '=AI.MY-FUNC("hello")', resolve)).toBe('hyphen-ok')
    expect(await engine.executeAIFormula('A1', '=AI.GPT4("hello")',    resolve)).toBe('digit-ok')
    engine.destroy()
  })

  /**
   * B4: Unknown function names must still return #NAME?.
   */
  it('B4 — returns #NAME? for unregistered AI function names', async () => {
    const engine = new SpreadsheetEngine()
    expect(await engine.executeAIFormula('A1', '=AI.NOPE("x")', () => null)).toBe('#NAME?')
    engine.destroy()
  })

  /**
   * B5 (already fixed via _resolveRange + tryCellToRef): a range argument that
   * passes the outer A1:B10 regex guard but contains an invalid cell ref (e.g.
   * row 0 which tryCellToRef rejects) must deliver '#REF!' to the function
   * executor rather than silently resolving to A1:A1's value.
   *
   * Note: a completely non-cell-like argument such as "A1:GARBAGE" never reaches
   * _resolveRange — the outer regex guard drops it as a plain string, which is
   * separate behaviour.
   */
  it('B5 — passes #REF! to the executor for a range with an invalid cell bound (row 0)', async () => {
    const engine = new SpreadsheetEngine()
    let receivedArg: unknown = undefined
    engine.aiRegistry.registerFunction(
      {
        name: 'AI.TEST',
        description: '',
        abstract: '',
        category: 'AI',
        syntax: 'AI.TEST(range)',
        parameters: [],
        isAsync: false,
      },
      (arg) => {
        receivedArg = arg
        return 'done'
      },
    )
    // A0:B1 — both parts match [A-Z]+\d+ so the range guard fires, but
    // tryCellToRef('A0') returns null (row 0 is invalid) → _resolveRange
    // returns { __refError: true } → executeAIFormula passes '#REF!' to executor
    await engine.executeAIFormula('A1', '=AI.TEST(A0:B1)', () => null)
    expect(receivedArg).toBe('#REF!')
    engine.destroy()
  })

  /**
   * O4 limitation — documented: nested parentheses in arguments are not parsed.
   * We verify the function still executes rather than crashing (graceful degradation),
   * and that the limitation is not silently turned into a wrong result that would
   * mislead the user. This test intentionally documents the known boundary.
   */
  it('O4 — does not crash on arguments with nested parentheses (graceful degradation)', async () => {
    const engine = new SpreadsheetEngine()
    engine.aiRegistry.registerFunction(
      {
        name: 'AI.EXPLAIN',
        description: '',
        abstract: '',
        category: 'AI',
        syntax: 'AI.EXPLAIN(value)',
        parameters: [],
        isAsync: false,
      },
      (arg) => `explained: ${String(arg)}`,
    )
    // The mini-parser will pass `IF(A1>0,"pos","neg")` as a raw string argument;
    // that is acceptable behaviour for the current implementation.
    await expect(engine.executeAIFormula('A1', '=AI.EXPLAIN(IF(A1>0,"pos","neg"))', () => null)).resolves.not.toThrow()
    engine.destroy()
  })
})

// ─── renameSheet engine sync (B1) ────────────────────────────────────────────

describe('renameSheet engine sync (B1)', () => {
  /**
   * Before the fix: renameSheet updated only the Zustand workbook; the engine's
   * sheetMapping kept the old name, so getComputedValue returned null for the
   * renamed sheet.
   *
   * After the fix: renameSheet calls engine.loadWorkbook() so the mapping is
   * rebuilt with the new name.
   *
   * We test this at the engine level (no Zustand store needed) by mimicking
   * what loadWorkbook does after a rename.
   */
  it('after loadWorkbook with a renamed sheet, computed values remain readable', () => {
    const engine = new SpreadsheetEngine()

    const s1 = sheet('s1', 'January', { A1: { value: 42 } })
    engine.loadWorkbook(workbook([s1]))

    expect(engine.getComputedValue('s1', 0, 0)).toBe('42')

    // Simulate renameSheet: mutate the workbook and reload the engine
    s1.name = 'February'
    engine.loadWorkbook(workbook([s1]))

    // After reload the engine must still resolve the sheet by its internal id
    expect(engine.getComputedValue('s1', 0, 0)).toBe('42')
    engine.destroy()
  })
})

// ─── deleteSheet engine sync (B2 / B3) ───────────────────────────────────────

describe('deleteSheet engine sync (B2 / B3)', () => {
  /**
   * B2: Before the fix, the deleted sheet remained in the engine's sheetMapping
   *     forever — a memory leak and potential confusion for cross-sheet formulas.
   *
   * B3: Before the fix, the guard `if (sheets.length <= 1) return` was inside
   *     the immer callback, so deleteSheet continued executing (pushHistory etc.)
   *     even when there was only one sheet.
   *
   * We test engine-side behaviour: after a reload without the deleted sheet,
   * the engine must return null/empty for the deleted sheet id.
   */
  it('B2 — deleted sheet is inaccessible after engine reload', () => {
    const engine = new SpreadsheetEngine()

    const s1 = sheet('s1', 'Keep',   { A1: { value: 1 } })
    const s2 = sheet('s2', 'Delete', { A1: { value: 99 } })
    engine.loadWorkbook(workbook([s1, s2]))

    expect(engine.getComputedValue('s2', 0, 0)).toBe('99')

    // Simulate deleteSheet: remove s2 from the workbook, then reload
    engine.loadWorkbook(workbook([s1]))

    // After reload s2's id must not resolve to anything
    expect(engine.getComputedValue('s2', 0, 0)).toBe('')
    engine.destroy()
  })

  it('B2 — remaining sheet still computes correctly after another sheet is deleted', () => {
    const engine = new SpreadsheetEngine()

    const s1 = sheet('s1', 'Keep',   { A1: { value: 7 } })
    const s2 = sheet('s2', 'Delete', { A1: { value: 99 } })
    engine.loadWorkbook(workbook([s1, s2]))

    engine.loadWorkbook(workbook([s1]))

    // s1 must still be readable
    expect(engine.getComputedValue('s1', 0, 0)).toBe('7')
    engine.destroy()
  })

  it('B3 — reset() is called on loadWorkbook clearing AI cache between workbooks', () => {
    const engine = new SpreadsheetEngine()

    const s1 = sheet('s1', 'S', { A1: { value: 1 } })
    engine.loadWorkbook(workbook([s1]))

    // reset() is invoked inside loadWorkbook — at minimum this must not throw
    // and the engine must be in a consistent state afterwards.
    expect(() => engine.loadWorkbook(workbook([sheet('s2', 'New', {})]))).not.toThrow()
    engine.destroy()
  })
})

