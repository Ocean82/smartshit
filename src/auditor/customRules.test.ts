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
})
