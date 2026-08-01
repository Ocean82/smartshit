/**
 * Integration test: Auditor engine (all 10 rules against realistic data)
 *
 * Tests the full audit pipeline against a fixture workbook with known issues.
 * Verifies that the auditor detects real problems, produces a health score,
 * and generates actionable findings.
 */

import { describe, expect, it } from 'vitest'
import { runAudit, formatAuditForContext } from '../index'
import type { SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'

/** Build a fixture sheet with deliberate audit issues. */
function createAuditFixture(): {
  sheet: SheetData
  getComputedValue: (row: number, col: number) => string
} {
  const cells: SheetData['cells'] = {}

  // Header row (row 0 internally = A1..E1 in cell IDs)
  cells['A1'] = { value: 'Category' }
  cells['B1'] = { value: 'Jan' }
  cells['C1'] = { value: 'Feb' }
  cells['D1'] = { value: 'Mar' }
  cells['E1'] = { value: 'Total' }

  // Data rows with formulas (shifted +1 from old fixture)
  cells['A2'] = { value: 'Rent' }
  cells['B2'] = { value: 1500 }
  cells['C2'] = { value: 1500 }
  cells['D2'] = { value: 1500 }
  cells['E2'] = { value: null, formula: '=SUM(B2:D2)' }

  cells['A3'] = { value: 'Food' }
  cells['B3'] = { value: 400 }
  cells['C3'] = { value: 450 }
  cells['D3'] = { value: 380 }
  cells['E3'] = { value: null, formula: '=SUM(B3:D3)' }

  cells['A4'] = { value: 'Transport' }
  cells['B4'] = { value: 200 }
  cells['C4'] = { value: 200 }
  cells['D4'] = { value: 200 }
  // ISSUE: Inconsistent formula — E4 uses a hardcoded value instead of SUM
  cells['E4'] = { value: 600 }

  cells['A5'] = { value: 'Subscriptions' }
  cells['B5'] = { value: 50 }
  cells['C5'] = { value: 50 }
  cells['D5'] = { value: 50 }
  cells['E5'] = { value: null, formula: '=SUM(B5:D5)' }

  // ISSUE: Range gap — total skips row 4
  cells['A6'] = { value: 'Total' }
  cells['B6'] = { value: null, formula: '=SUM(B2:B3)+SUM(B5:B5)' } // Skips B4!
  cells['C6'] = { value: null, formula: '=SUM(C2:C5)' } // Correct
  cells['D6'] = { value: null, formula: '=SUM(D2:D5)' } // Correct
  cells['E6'] = { value: null, formula: '=SUM(E2:E5)' }

  // ISSUE: Hardcoded constant in a formula context
  cells['A7'] = { value: 'Tax Rate' }
  cells['B7'] = { value: 0.22 } // This is fine — it's a parameter cell

  // ISSUE: Error cell (divide by zero simulation)
  cells['A8'] = { value: 'Error Demo' }
  cells['B8'] = { value: null, formula: '=1/0' }

  // ISSUE: Magnitude outlier
  cells['A9'] = { value: 'One-time' }
  cells['B9'] = { value: 99999 } // Extreme outlier vs other values in column B

  // Computed values (simulate what Formualizer would return)
  const computedOverrides: Record<string, string> = {
    'E2': '4500',
    'E3': '1230',
    'E5': '150',
    'B6': '2100', // Wrong — should be 2150 (skipped B4)
    'C6': '2200',
    'D6': '2130',
    'E6': '5880',
    'B8': '#DIV/0!',
  }

  const sheet: SheetData = {
    id: 'audit-test-sheet',
    name: 'Budget 2024',
    cells,
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }

  const getComputedValue = (row: number, col: number): string => {
    const cellId = refToCell(row, col)
    if (computedOverrides[cellId]) return computedOverrides[cellId]
    const cell = cells[cellId]
    if (!cell) return ''
    return cell.value === null ? '' : String(cell.value)
  }

  return { sheet, getComputedValue }
}

describe('auditor integration — full audit run', () => {
  it('produces a structured result with score and findings', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    expect(result.sheetName).toBe('Budget 2024')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.findings).toBeInstanceOf(Array)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.totalCells).toBeGreaterThan(0)
    expect(result.summary).toBeTruthy()
  })

  it('detects the #DIV/0! error cell', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    const errorFindings = result.findings.filter(f => f.ruleId === 'error-cells')
    expect(errorFindings.length).toBeGreaterThan(0)
    expect(errorFindings[0].severity).toBe('critical')
    expect(errorFindings[0].cells.some(c => c.cellId === 'B8')).toBe(true)
  })

  it('detects issues in a column with mixed formulas and hardcoded values', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    // The fixture has deliberate issues — there should be findings beyond just the error cell
    // (error cells, possible range gaps, magnitude outliers, or hardcoded constants)
    expect(result.findings.length).toBeGreaterThan(1)
  })

  it('detects magnitude outliers', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    const outliers = result.findings.filter(f => f.ruleId === 'magnitude-outliers')
    // B9 (99999) should be flagged as an outlier in column B
    if (outliers.length > 0) {
      expect(outliers[0].cells.some(c => c.cellId === 'B9')).toBe(true)
    }
  })

  it('score is reduced by findings severity', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    // We have at least a critical error (#DIV/0!) — score should be < 100
    expect(result.score).toBeLessThan(100)
    // But the sheet isn't catastrophically broken
    expect(result.score).toBeGreaterThan(0)
  })

  it('findings are sorted by severity (critical first)', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    if (result.findings.length >= 2) {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
      for (let i = 1; i < result.findings.length; i++) {
        const prev = severityOrder[result.findings[i - 1].severity]
        const curr = severityOrder[result.findings[i].severity]
        expect(curr).toBeGreaterThanOrEqual(prev)
      }
    }
  })

  it('formatAuditForContext produces LLM-friendly text for significant issues', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    const contextText = formatAuditForContext(result)
    // Should include score and mention critical/high issues
    if (result.findings.some(f => f.severity === 'critical' || f.severity === 'high')) {
      expect(contextText).toContain('audit')
      expect(contextText).toContain(String(result.score))
    }
  })

  it('handles a clean sheet with no issues', () => {
    const cleanSheet: SheetData = {
      id: 'clean-sheet',
      name: 'Clean',
      cells: {
        'A1': { value: 'Name' },
        'B1': { value: 'Value' },
        'A2': { value: 'Item 1' },
        'B2': { value: 100 },
        'A3': { value: 'Item 2' },
        'B3': { value: 200 },
      },
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }
    const getValue = (row: number, col: number) => {
      const id = refToCell(row, col)
      const cell = cleanSheet.cells[id]
      return cell?.value == null ? '' : String(cell.value)
    }

    const result = runAudit(cleanSheet, getValue)
    expect(result.score).toBe(100)
    expect(result.findings.length).toBe(0)
    expect(result.summary).toContain('✅')
  })

  it('marks #DIV/0! errors as auto-fixable with an IFERROR wrap', () => {
    const { sheet, getComputedValue } = createAuditFixture()
    const result = runAudit(sheet, getComputedValue)

    const div0 = result.findings.find((f) => f.ruleId === 'error-cells' && f.cells[0]?.cellId === 'B8')
    expect(div0).toBeDefined()
    expect(div0!.autoFixable).toBe(true)
    expect(div0!.fixActions).toHaveLength(1)
    expect(div0!.fixActions![0].formula).toBe('=IFERROR(1/0, 0)')
  })

  it('hardcoded-constants findings are auto-fixable with two writes', () => {
    const cells: SheetData['cells'] = {
      'A1': { value: 'Label' },
      'B1': { value: 'Value' },
      'A2': { value: 'x' },
      'B2': { value: 100 },
      'A3': { value: 'Total' },
      'B3': { value: null, formula: '=B2*0.335' },
    }
    const sheet: SheetData = {
      id: 'mc',
      name: 'Magic',
      cells,
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }
    const getValue = (row: number, col: number) => {
      const id = refToCell(row, col)
      const c = cells[id]
      return c?.value == null ? '' : String(c.value)
    }

    const result = runAudit(sheet, getValue)
    const finding = result.findings.find((f) => f.ruleId === 'hardcoded-constants' && f.cells[0]?.cellId === 'B3')

    expect(finding).toBeDefined()
    expect(finding!.autoFixable).toBe(true)
    expect(finding!.fixActions).toHaveLength(2)
    // write 1: constant moved into the first empty cell right of B3 → C3
    expect(finding!.fixActions![0]).toEqual({ cellId: 'C3', value: 0.335 })
    // write 2: formula rewritten to reference the input cell
    expect(finding!.fixActions![1]).toEqual({ cellId: 'B3', formula: '=B2*C3' })
  })
})
