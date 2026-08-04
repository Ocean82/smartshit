/**
 * Unit tests for the ONNX Formula Consistency auditor rule.
 *
 * Validates: Requirements 8.1, 8.4
 */

import { describe, expect, it } from 'vitest'
import { onnxFormulaConsistencyRule } from './onnxFormulaConsistency'
import type { AuditContext, CellInfo } from '../types'
import { colToLetter } from '../utils'

/** Helper to build a CellInfo with a formula in a given column and row. */
function makeFormulaCell(row: number, col: number, formula: string): CellInfo {
  const colLetter = colToLetter(col)
  return {
    cellId: `${colLetter}${row + 1}`,
    row,
    col,
    rawValue: null,
    formula,
    computedValue: '0',
    type: 'formula',
  }
}

/** Helper to create a minimal AuditContext from a set of cells. */
function makeContext(cells: CellInfo[]): AuditContext {
  let maxRow = 0
  let maxCol = 0
  for (const c of cells) {
    if (c.row > maxRow) maxRow = c.row
    if (c.col > maxCol) maxCol = c.col
  }

  return {
    sheetName: 'Test',
    allCells: cells,
    formulaCells: cells.filter((c) => c.formula),
    maxRow,
    maxCol,
    getCellAt(row: number, col: number) {
      return cells.find((c) => c.row === row && c.col === col) ?? null
    },
    getColumn(col: number) {
      return cells.filter((c) => c.col === col)
    },
    getRow(row: number) {
      return cells.filter((c) => c.row === row)
    },
  }
}

describe('onnxFormulaConsistencyRule', () => {
  it('has correct rule metadata', () => {
    expect(onnxFormulaConsistencyRule.id).toBe('onnx-formula-consistency')
    expect(onnxFormulaConsistencyRule.name).toBe('ONNX Formula Consistency')
    expect(onnxFormulaConsistencyRule.defaultSeverity).toBe('high')
  })

  it('skips columns with fewer than 3 formula cells', () => {
    const cells = [
      makeFormulaCell(0, 0, 'ONNX.RUN("model", A1:A10)'),
      makeFormulaCell(1, 0, 'SUM(B1:B10)'),
    ]
    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('skips columns with exactly 2 formula cells', () => {
    const cells = [
      makeFormulaCell(0, 0, 'ONNX.RUN("model", A1:A10)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("model", A1:A10)'),
    ]
    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('does not flag when all formulas are ONNX (no minority)', () => {
    const cells = [
      makeFormulaCell(0, 0, 'ONNX.RUN("model", A1:A10)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("model", B1:B10)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("model", C1:C10)'),
    ]
    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('does not flag when all formulas are native (no minority)', () => {
    const cells = [
      makeFormulaCell(0, 0, 'SUM(B1:B10)'),
      makeFormulaCell(1, 0, 'AVERAGE(B1:B10)'),
      makeFormulaCell(2, 0, 'MAX(B1:B10)'),
    ]
    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('flags native minority when ONNX formulas are ≥70%', () => {
    // 7 ONNX + 3 native = 70% ONNX → flag native cells
    const cells: CellInfo[] = []
    for (let i = 0; i < 7; i++) {
      cells.push(makeFormulaCell(i, 0, 'ONNX.RUN("model", A1:A10)'))
    }
    for (let i = 7; i < 10; i++) {
      cells.push(makeFormulaCell(i, 0, 'SUM(B1:B10)'))
    }

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('high')
    expect(findings[0].ruleId).toBe('onnx-formula-consistency')
    expect(findings[0].cells).toHaveLength(3)
    // Flagged cells should be rows 7, 8, 9 (the native ones)
    expect(findings[0].cells.map((c) => c.row)).toEqual([7, 8, 9])
  })

  it('flags ONNX minority when native formulas are ≥70%', () => {
    // 8 native + 2 ONNX = 80% native → flag ONNX cells
    const cells: CellInfo[] = []
    for (let i = 0; i < 8; i++) {
      cells.push(makeFormulaCell(i, 0, 'SUM(B1:B10)'))
    }
    for (let i = 8; i < 10; i++) {
      cells.push(makeFormulaCell(i, 0, 'ONNX.RUN("model", A1:A10)'))
    }

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('high')
    expect(findings[0].cells).toHaveLength(2)
    expect(findings[0].cells.map((c) => c.row)).toEqual([8, 9])
  })

  it('does not flag when neither type reaches 70%', () => {
    // 3 ONNX + 2 native = 60% ONNX, 40% native — neither dominant
    const cells: CellInfo[] = [
      makeFormulaCell(0, 0, 'ONNX.RUN("model", A1:A10)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("model", B1:B10)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("model", C1:C10)'),
      makeFormulaCell(3, 0, 'SUM(B1:B10)'),
      makeFormulaCell(4, 0, 'AVERAGE(B1:B10)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('handles exact 70% threshold boundary', () => {
    // 7 ONNX + 3 native = exactly 70% → should flag
    const cells: CellInfo[] = []
    for (let i = 0; i < 7; i++) {
      cells.push(makeFormulaCell(i, 0, 'ONNX.RUN("m", A1)'))
    }
    for (let i = 7; i < 10; i++) {
      cells.push(makeFormulaCell(i, 0, 'SUM(A1)'))
    }

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].cells).toHaveLength(3)
  })

  it('does not flag just below 70% threshold', () => {
    // 69/100 ONNX = 69% → should not flag
    const cells: CellInfo[] = []
    for (let i = 0; i < 69; i++) {
      cells.push(makeFormulaCell(i, 0, 'ONNX.RUN("m", A1)'))
    }
    for (let i = 69; i < 100; i++) {
      cells.push(makeFormulaCell(i, 0, 'SUM(A1)'))
    }

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('handles case-insensitive ONNX detection', () => {
    // Mix of case styles should all be classified as ONNX
    const cells: CellInfo[] = [
      makeFormulaCell(0, 0, 'onnx.run("model", A1:A10)'),
      makeFormulaCell(1, 0, 'Onnx.Run("model", A1:A10)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("model", A1:A10)'),
      makeFormulaCell(3, 0, 'SUM(B1:B10)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    expect(findings).toHaveLength(1)
    // The native cell is the minority (1 out of 4 = 75% ONNX)
    expect(findings[0].cells).toHaveLength(1)
    expect(findings[0].cells[0].row).toBe(3)
  })

  it('processes multiple columns independently', () => {
    const cells: CellInfo[] = [
      // Column A: 3 ONNX + 1 native = 75% ONNX → flag native
      makeFormulaCell(0, 0, 'ONNX.RUN("m", A1)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("m", A2)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("m", A3)'),
      makeFormulaCell(3, 0, 'SUM(B1:B3)'),
      // Column B: 3 native + 1 ONNX = 75% native → flag ONNX
      makeFormulaCell(0, 1, 'SUM(A1:A3)'),
      makeFormulaCell(1, 1, 'AVERAGE(A1:A3)'),
      makeFormulaCell(2, 1, 'MAX(A1:A3)'),
      makeFormulaCell(3, 1, 'ONNX.RUN("m", B1)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    expect(findings).toHaveLength(2)
    // First finding: column A flagging the native minority
    const colAFinding = findings.find((f) => f.cells[0].col === 0)
    expect(colAFinding).toBeDefined()
    expect(colAFinding!.cells).toHaveLength(1)
    expect(colAFinding!.cells[0].row).toBe(3)

    // Second finding: column B flagging the ONNX minority
    const colBFinding = findings.find((f) => f.cells[0].col === 1)
    expect(colBFinding).toBeDefined()
    expect(colBFinding!.cells).toHaveLength(1)
    expect(colBFinding!.cells[0].row).toBe(3)
  })

  it('ignores non-formula cells when counting', () => {
    const cells: CellInfo[] = [
      // 3 ONNX formula cells
      makeFormulaCell(0, 0, 'ONNX.RUN("m", A1)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("m", A2)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("m", A3)'),
      // 1 native formula cell (minority)
      makeFormulaCell(3, 0, 'SUM(B1:B3)'),
      // Non-formula cells should not affect the ratio
      {
        cellId: 'A5',
        row: 4,
        col: 0,
        rawValue: 42,
        formula: null,
        computedValue: '42',
        type: 'number',
      },
      {
        cellId: 'A6',
        row: 5,
        col: 0,
        rawValue: 'text',
        formula: null,
        computedValue: 'text',
        type: 'string',
      },
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    // 3 ONNX / 4 total formulas = 75% → flag the native cell
    expect(findings).toHaveLength(1)
    expect(findings[0].cells).toHaveLength(1)
    expect(findings[0].cells[0].row).toBe(3)
  })

  it('finding message includes affected cell addresses', () => {
    const cells: CellInfo[] = [
      makeFormulaCell(0, 0, 'ONNX.RUN("m", A1)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("m", A2)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("m", A3)'),
      makeFormulaCell(3, 0, 'ONNX.RUN("m", A4)'),
      makeFormulaCell(4, 0, 'SUM(B1:B3)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toContain('A5')
    expect(findings[0].cells[0].cellId).toBe('A5')
  })

  it('finding is not auto-fixable', () => {
    const cells: CellInfo[] = [
      makeFormulaCell(0, 0, 'ONNX.RUN("m", A1)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("m", A2)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("m", A3)'),
      makeFormulaCell(3, 0, 'SUM(B1:B3)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].autoFixable).toBe(false)
  })

  it('returns empty findings for an empty context', () => {
    const ctx = makeContext([])
    const findings = onnxFormulaConsistencyRule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('handles minimum case: exactly 3 formula cells with 1 minority (≈67%)', () => {
    // 2 ONNX + 1 native = 66.7% ONNX — just below threshold
    const cells: CellInfo[] = [
      makeFormulaCell(0, 0, 'ONNX.RUN("m", A1)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("m", A2)'),
      makeFormulaCell(2, 0, 'SUM(A1)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    // 2/3 = 66.7% < 70% → no finding
    expect(findings).toHaveLength(0)
  })

  it('handles minimum case: exactly 3 formula cells where all same type', () => {
    const cells: CellInfo[] = [
      makeFormulaCell(0, 0, 'ONNX.RUN("m", A1)'),
      makeFormulaCell(1, 0, 'ONNX.RUN("m", A2)'),
      makeFormulaCell(2, 0, 'ONNX.RUN("m", A3)'),
    ]

    const ctx = makeContext(cells)
    const findings = onnxFormulaConsistencyRule.run(ctx)
    // 100% ONNX, no minority → no finding
    expect(findings).toHaveLength(0)
  })
})
