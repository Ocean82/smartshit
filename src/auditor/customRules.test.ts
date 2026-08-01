/**
 * Unit tests: Custom audit rules engine (evaluation + persistence).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { runAudit } from './index'
import { loadCustomRules, saveCustomRules } from './customRules'
import type { CustomAuditRule } from './customRules'
import type { SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'

function makeSheet(): { sheet: SheetData; getComputedValue: (row: number, col: number) => string } {
  const cells: SheetData['cells'] = {
    'A0': { value: 'Item' },
    'B0': { value: 'Amount' },
    'A1': { value: 'Rent' },
    'B1': { value: 1500 },
    'A2': { value: 'Servers' },
    'B2': { value: 6000 },
    'A3': { value: 'Marketing' },
    'B3': { value: 8200 },
    'A4': { value: 'Note' },
    'B4': { value: 'n/a' },
    'A5': { value: 'Blank label' },
    'B5': { value: '' },
  }
  const sheet: SheetData = {
    id: 'custom-test',
    name: 'Expenses',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
  const getComputedValue = (row: number, col: number) => {
    const cell = cells[refToCell(row, col)]
    return cell?.value == null ? '' : String(cell.value)
  }
  return { sheet, getComputedValue }
}

function rule(overrides: Partial<CustomAuditRule> = {}): CustomAuditRule {
  return {
    id: 'r1',
    name: 'Large expense',
    column: 'B',
    operator: 'gt',
    value: 5000,
    severity: 'high',
    enabled: true,
    ...overrides,
  }
}

/** Fixture with values in column B only (no header row, avoids the 0-based-ID quirk of makeSheet). */
function makeColumnB(values: Array<string | number>): { sheet: SheetData; getComputedValue: (row: number, col: number) => string } {
  const cells: SheetData['cells'] = {}
  values.forEach((v, i) => {
    cells[`A${i + 1}`] = { value: `Item ${i + 1}` }
    cells[`B${i + 1}`] = { value: v }
  })
  const sheet: SheetData = {
    id: 'col-b',
    name: 'Numbers',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
  const getComputedValue = (row: number, col: number) => {
    const cell = cells[refToCell(row, col)]
    return cell?.value == null ? '' : String(cell.value)
  }
  return { sheet, getComputedValue }
}

/** Fixture: column A holds plain labels, column B holds formula cells whose values come only from getComputedValue. */
function makeComputedSheet(): { sheet: SheetData; getComputedValue: (row: number, col: number) => string } {
  const cells: SheetData['cells'] = {
    'A1': { value: 'Rent' },
    'B1': { value: null, formula: '=1234' },
    'A2': { value: 'Servers' },
    'B2': { value: null, formula: '=7351' },
    'A3': { value: 'Marketing' },
    'B3': { value: null, formula: '=SUM(B1:B2)' },
    'A4': { value: 'Notes' },
    'B4': { value: null, formula: '=IF(TRUE,"large","small")' },
    'B5': { value: '' },
  }
  const computed: Record<string, string> = {
    'B1': '1234',
    'B2': '7351',
    'B3': '12000',
    'B4': 'large',
  }
  const sheet: SheetData = {
    id: 'computed-test',
    name: 'Computed',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
  const getComputedValue = (row: number, col: number) => {
    const cellId = refToCell(row, col)
    return computed[cellId] ?? ''
  }
  return { sheet, getComputedValue }
}

describe('custom audit rules', () => {
  it('flags rows whose numeric value exceeds the threshold', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule()])

    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings).toHaveLength(2)
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B2', 'B3'])
    expect(findings[0].severity).toBe('high')
    expect(findings[0].autoFixable).toBe(false)
    expect(findings[0].suggestion).toContain('> 5000')
  })

  it('skips non-numeric cells for numeric operators', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule()])
    const matched = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(matched.some((f) => f.cells[0].cellId === 'B4')).toBe(false)
    expect(matched.some((f) => f.cells[0].cellId === 'B5')).toBe(false)
  })

  it('supports the contains text operator', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'A', operator: 'contains', value: 'ark' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['A3'])
  })

  it('contains matches numeric cells by their string form', () => {
    const { sheet, getComputedValue } = makeColumnB([1500, 6000, 8205])
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'contains', value: '00' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B1', 'B2'])
  })

  it('notContains is the exact complement of contains on numeric cells', () => {
    const { sheet, getComputedValue } = makeColumnB([1500, 6000, 8205])
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'notContains', value: '00' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B3'])
  })

  it('notContains flags non-matching text rows', () => {
    const { sheet, getComputedValue } = makeColumnB(['Rent', 'Servers', 'Marketing', 'Note', 'Blank label'])
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'notContains', value: 'ark' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B1', 'B2', 'B4', 'B5'])
  })

  it('supports lt with a strict less-than comparison', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ operator: 'lt', value: 6000 })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['B1'])
  })

  it('supports isNotEmpty, skipping empty cells', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ operator: 'isNotEmpty', value: '' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    const cellIds = findings.map((f) => f.cells[0].cellId).sort()
    expect(cellIds).toEqual(['B1', 'B2', 'B3', 'B4'])
    expect(cellIds).not.toContain('B5')
  })

  it('supports isEmpty', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ operator: 'isEmpty', value: '' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['B5'])
  })

  it('skips disabled rules', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ enabled: false })])
    expect(result.findings.some((f) => f.ruleId === 'custom:r1')).toBe(false)
  })

  it('skips rules with invalid column letters', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: '!@' })])
    expect(result.findings.some((f) => f.ruleId === 'custom:r1')).toBe(false)
  })

  it('produces no custom findings when no custom rules are passed', () => {
    const { sheet, getComputedValue } = makeSheet()
    const result = runAudit(sheet, getComputedValue)
    expect(result.findings.some((f) => f.ruleId === 'custom:r1')).toBe(false)
  })
})

describe('custom audit rules — computed values of formula cells', () => {
  it('numeric operators evaluate the computed value of formula cells', () => {
    const { sheet, getComputedValue } = makeComputedSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'gt', value: 6000 })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B2', 'B3'])
  })

  it('isEmpty treats formula cells computing a value as not empty', () => {
    const { sheet, getComputedValue } = makeComputedSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'isEmpty', value: '' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['B5'])
  })

  it('isNotEmpty includes formula cells computing a value', () => {
    const { sheet, getComputedValue } = makeComputedSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'isNotEmpty', value: '' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId).sort()).toEqual(['B1', 'B2', 'B3', 'B4'])
  })

  it('contains searches the computed value of formula cells', () => {
    const { sheet, getComputedValue } = makeComputedSheet()
    const result = runAudit(sheet, getComputedValue, [rule({ column: 'B', operator: 'contains', value: '000' })])
    const findings = result.findings.filter((f) => f.ruleId === 'custom:r1')
    expect(findings.map((f) => f.cells[0].cellId)).toEqual(['B3'])
  })
})

describe('custom audit rules — persistence', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips rules through localStorage', () => {
    expect(loadCustomRules()).toEqual([])
    saveCustomRules([rule()])
    expect(loadCustomRules()).toEqual([rule()])
  })

  it('drops malformed or unknown-shape persisted rules', () => {
    const seed = [
      rule({ id: 'valid', name: 'Valid' }),
      { foo: 1 },
      { ...rule({ id: 'bad-sev' }), severity: 'purple' },
      { ...rule({ id: 'bad-op' }), operator: 'wat' },
      { id: 'no-enabled', name: 'NoEnabled', column: 'A', operator: 'gt', value: 1, severity: 'high' },
    ]
    localStorage.setItem('smartsht-audit-rules', JSON.stringify(seed))
    const loaded = loadCustomRules()
    expect(loaded.map((r) => r.id)).toEqual(['valid'])
  })

  it('returns [] for non-array JSON', () => {
    localStorage.setItem('smartsht-audit-rules', JSON.stringify({ a: 1 }))
    expect(loadCustomRules()).toEqual([])
  })
})
