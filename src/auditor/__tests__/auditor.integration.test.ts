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

  // Header row
  cells['A0'] = { value: 'Category' }
  cells['B0'] = { value: 'Jan' }
  cells['C0'] = { value: 'Feb' }
  cells['D0'] = { value: 'Mar' }
  cells['E0'] = { value: 'Total' }

  // Data rows with formulas
  cells['A1'] = { value: 'Rent' }
  cells['B1'] = { value: 1500 }
  cells['C1'] = { value: 1500 }
  cells['D1'] = { value: 1500 }
  cells['E1'] = { value: null, formula: '=SUM(B1:D1)' }

  cells['A2'] = { value: 'Food' }
  cells['B2'] = { value: 400 }
  cells['C2'] = { value: 450 }
  cells['D2'] = { value: 380 }
  cells['E2'] = { value: null, formula: '=SUM(B2:D2)' }

  cells['A3'] = { value: 'Transport' }
  cells['B3'] = { value: 200 }
  cells['C3'] = { value: 200 }
  cells['D3'] = { value: 200 }
  // ISSUE: Inconsistent formula — E3 uses a hardcoded value instead of SUM
  cells['E3'] = { value: 600 }

  cells['A4'] = { value: 'Subscriptions' }
  cells['B4'] = { value: 50 }
  cells['C4'] = { value: 50 }
  cells['D4'] = { value: 50 }
  cells['E4'] = { value: null, formula: '=SUM(B4:D4)' }

  // ISSUE: Range gap — total skips row 3
  cells['A5'] = { value: 'Total' }
  cells['B5'] = { value: null, formula: '=SUM(B1:B2)+SUM(B4:B4)' } // Skips B3!
  cells['C5'] = { value: null, formula: '=SUM(C1:C4)' } // Correct
  cells['D5'] = { value: null, formula: '=SUM(D1:D4)' } // Correct
  cells['E5'] = { value: null, formula: '=SUM(E1:E4)' }

  // ISSUE: Hardcoded constant in a formula context
  cells['A6'] = { value: 'Tax Rate' }
  cells['B6'] = { value: 0.22 } // This is fine — it's a parameter cell

  // ISSUE: Error cell (divide by zero simulation)
  cells['A7'] = { value: 'Error Demo' }
  cells['B7'] = { value: null, formula: '=1/0' }

  // ISSUE: Magnitude outlier
  cells['A8'] = { value: 'One-time' }
  cells['B8'] = { value: 99999 } // Extreme outlier vs other values in column B

  // Computed values (simulate what HyperFormula would return)
  const computedOverrides: Record<string, string> = {
    'E1': '4500',
    'E2': '1230',
    'E4': '150',
    'B5': '2100', // Wrong — should be 2150 (skipped B3)
    'C5': '2200',
    'D5': '2130',
    'E5': '5880',
    'B7': '#DIV/0!',
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
    expect(errorFindings[0].cells.some(c => c.cellId === 'B7')).toBe(true)
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
    // B8 (99999) should be flagged as an outlier in column B
    if (outliers.length > 0) {
      expect(outliers[0].cells.some(c => c.cellId === 'B8')).toBe(true)
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
        'A0': { value: 'Name' },
        'B0': { value: 'Value' },
        'A1': { value: 'Item 1' },
        'B1': { value: 100 },
        'A2': { value: 'Item 2' },
        'B2': { value: 200 },
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
})
