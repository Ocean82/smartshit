import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAudit, findingKey, cellSignature } from '../index'
import { normalizeFormula, replaceRangeRef } from '../utils'
import { isAuditorEnabled, saveAuditorEnabled, loadDismissed, saveDismissed } from '../preferences'
import type { DismissedFindingEntry } from '../types'
import type { SheetData } from '@/types'

function sheetOf(cells: SheetData['cells']): SheetData {
  return { id: 's1', name: 'Sheet1', cells, columnWidths: {}, rowHeights: {}, charts: [] }
}

describe('normalizeFormula', () => {
  it('does not read function names or string literals as cell references', () => {
    // LOG10 / "Q2" look like refs but must normalize identically on every row.
    expect(normalizeFormula('LOG10(A2)', 1, 1)).toBe(normalizeFormula('LOG10(A3)', 2, 1))
    expect(normalizeFormula('IF(A5>0,"Q2","x")', 4, 1)).toBe(normalizeFormula('IF(A9>0,"Q2","x")', 8, 1))
  })

  it('still normalizes real references', () => {
    expect(normalizeFormula('B2*C2', 1, 3)).toBe('R[0]C[-2]*R[0]C[-1]')
  })

  it('does not flag a fill-down LOG10 column as inconsistent', () => {
    const cells: SheetData['cells'] = {}
    for (let r = 2; r <= 6; r++) {
      cells[`A${r}`] = { value: r }
      cells[`B${r}`] = { value: null, formula: `=LOG10(A${r})` }
    }
    const findings = runAudit(sheetOf(cells), () => '1').findings
    expect(findings.filter((f) => f.ruleId === 'inconsistent-formulas')).toEqual([])
  })
})

describe('range-gap fix', () => {
  it('replaceRangeRef skips other-sheet ranges with the same text', () => {
    expect(replaceRangeRef('SUM(Other!A2:A3)+SUM(A2:A3)', 'A2:A3', 'A2:A4')).toBe('SUM(Other!A2:A3)+SUM(A2:A4)')
  })

  it('edits the on-sheet range, not the other-sheet one', () => {
    const cells: SheetData['cells'] = {
      A1: { value: 1 }, A2: { value: 2 }, A3: { value: 3 }, A4: { value: 4 },
      C1: { value: null, formula: '=SUM(Other!A2:A3)+SUM(A2:A3)' },
    }
    const fix = runAudit(sheetOf(cells), () => '0').findings.find((f) => f.ruleId === 'range-gaps')?.fixActions?.[0]
    expect(fix?.formula).toMatch(/^=SUM\(Other!A2:A3\)\+SUM\(A\d:A\d\)$/)
  })
})

describe('dismissing findings', () => {
  const cells = (): SheetData['cells'] => ({
    A1: { value: 1 }, A2: { value: 2 }, A3: { value: 3 }, A4: { value: 4 },
    C1: { value: null, formula: '=SUM(A2:A3)' },
    D1: { value: null, formula: '=SUM(A2:A3)' },
  })
  const dismissOne = (sheet: SheetData, ruleId: string, cellId: string): Record<string, DismissedFindingEntry> => {
    const finding = runAudit(sheet, () => '0').findings.find((f) => f.ruleId === ruleId && f.cells[0].cellId === cellId)!
    return {
      [findingKey(sheet.id, finding)]: {
        cellIds: finding.cells.map((c) => c.cellId),
        dismissedAt: 1,
        valueSnapshot: Object.fromEntries(finding.cells.map((c) => [c.cellId, cellSignature(sheet.cells[c.cellId])])),
      },
    }
  }

  it('hides only the dismissed finding and keeps the score honest', () => {
    const sheet = sheetOf(cells())
    const before = runAudit(sheet, () => '0')
    const gaps = before.findings.filter((f) => f.ruleId === 'range-gaps')
    expect(gaps.length).toBeGreaterThanOrEqual(2)

    const after = runAudit(sheet, () => '0', [], dismissOne(sheet, 'range-gaps', 'C1'))
    expect(after.findings.length).toBe(before.findings.length - 1)
    expect(after.dismissed).toHaveLength(1)
    expect(after.findings.some((f) => f.ruleId === 'range-gaps' && f.cells[0].cellId === 'D1')).toBe(true)
    expect(after.score).toBeGreaterThan(before.score)
  })

  it('brings the finding back when one of its cells changes', () => {
    const sheet = sheetOf(cells())
    const dismissed = dismissOne(sheet, 'range-gaps', 'C1')
    const edited = sheetOf({ ...cells(), C1: { value: null, formula: '=SUM(A2:A3)+0' } })
    const result = runAudit(edited, () => '0', [], dismissed)
    expect(result.dismissed).toHaveLength(0)
    expect(result.findings.some((f) => f.ruleId === 'range-gaps' && f.cells[0].cellId === 'C1')).toBe(true)
  })
})

describe('auditor preferences', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is on by default and remembers being switched off and on', () => {
    expect(isAuditorEnabled()).toBe(true)
    saveAuditorEnabled(false)
    expect(isAuditorEnabled()).toBe(false)
    saveAuditorEnabled(true)
    expect(isAuditorEnabled()).toBe(true)
  })

  it('stores dismissals per workbook and ignores malformed entries', () => {
    const entry: DismissedFindingEntry = { cellIds: ['A1'], dismissedAt: 5 }
    saveDismissed('wb1', { k: entry })
    expect(loadDismissed('wb1')).toEqual({ k: entry })
    expect(loadDismissed('wb2')).toEqual({})
    localStorage.setItem('smartsht-audit-dismissed:wb3', JSON.stringify({ bad: { cellIds: 'x' }, ok: entry }))
    expect(loadDismissed('wb3')).toEqual({ ok: entry })
  })
})

describe('audit robustness', () => {
  it('an engine failure on one cell does not abort the audit', () => {
    const cells: SheetData['cells'] = {
      A1: { value: 1 }, A2: { value: null, formula: '=A1+1' }, A3: { value: null, formula: '=1/0' },
    }
    const result = runAudit(sheetOf(cells), (row) => {
      if (row === 1) throw new Error('engine exploded')
      return row === 2 ? '#DIV/0!' : '1'
    })
    expect(result.totalCells).toBe(3)
    expect(result.findings.some((f) => f.ruleId === 'error-cells')).toBe(true)
  })

  it('one noisy rule cannot take more than 40 points off the score', () => {
    const cells: SheetData['cells'] = {}
    for (let r = 1; r <= 30; r++) cells[`A${r}`] = { value: null, formula: `=1/0` }
    const result = runAudit(sheetOf(cells), () => '#DIV/0!')
    expect(result.findings.filter((f) => f.ruleId === 'error-cells')).toHaveLength(30)
    expect(result.score).toBe(60)
  })

  it('does not flag numbers or volatile names that only appear inside quoted text', () => {
    const cells: SheetData['cells'] = {
      A1: { value: 1 },
      B1: { value: null, formula: '=IF(A1>0,"Q3 2024 target 4817","n/a")' },
      B2: { value: null, formula: '=IF(A1>0,"RAND(1) 9999","x")' },
      B3: { value: null, formula: '=KNOW(A1)' },
    }
    const ids = runAudit(sheetOf(cells), () => '1').findings.map((f) => f.ruleId)
    expect(ids).not.toContain('hardcoded-constants')
    expect(ids).not.toContain('volatile-functions')
  })

  it('still flags a real hardcoded number and a real volatile call', () => {
    const cells: SheetData['cells'] = {
      A1: { value: 1 },
      B1: { value: null, formula: '=A1*4817' },
      B2: { value: null, formula: '=RAND()+A1' },
    }
    const ids = runAudit(sheetOf(cells), () => '1').findings.map((f) => f.ruleId)
    expect(ids).toContain('hardcoded-constants')
    expect(ids).toContain('volatile-functions')
  })

  it('finds an outlier in a long column without crashing', () => {
    const cells: SheetData['cells'] = {}
    for (let r = 1; r <= 40; r++) cells[`A${r}`] = { value: 100 + (r % 3) }
    cells.A20 = { value: 100000 }
    const outliers = runAudit(sheetOf(cells), () => '1').findings.filter((f) => f.ruleId === 'magnitude-outliers')
    expect(outliers.map((f) => f.cells[0].cellId)).toEqual(['A20'])
  })
})