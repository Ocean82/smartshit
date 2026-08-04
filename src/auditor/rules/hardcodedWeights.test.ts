/**
 * Unit tests for Hardcoded Weights Detection rule.
 *
 * Requirements: 8.2, 8.5
 */

import { describe, expect, it } from 'vitest'
import { hardcodedWeightsRule, isHighPrecisionNumeric, findContiguousRuns, isSuppressed } from './hardcodedWeights'
import type { AuditContext, CellInfo, DismissedFindingEntry } from '../types'

/** Helper to create a numeric CellInfo */
function makeCell(cellId: string, row: number, col: number, value: number): CellInfo {
  return {
    cellId,
    row,
    col,
    rawValue: value,
    formula: null,
    computedValue: String(value),
    type: 'number',
  }
}

/** Helper to create a formula CellInfo */
function makeFormulaCell(cellId: string, row: number, col: number, formula: string): CellInfo {
  return {
    cellId,
    row,
    col,
    rawValue: null,
    formula,
    computedValue: '0.12345',
    type: 'formula',
  }
}

/** Helper to build an AuditContext from a list of cells */
function buildContext(
  cells: CellInfo[],
  dismissedFindings?: Record<string, DismissedFindingEntry>,
): AuditContext {
  let maxRow = 0
  let maxCol = 0
  const cellMap = new Map<string, CellInfo>()

  for (const cell of cells) {
    cellMap.set(cell.cellId, cell)
    if (cell.row > maxRow) maxRow = cell.row
    if (cell.col > maxCol) maxCol = cell.col
  }

  return {
    sheetName: 'Test',
    allCells: cells,
    formulaCells: cells.filter((c) => c.formula !== null),
    maxRow,
    maxCol,
    getCellAt(row, col) {
      for (const c of cells) {
        if (c.row === row && c.col === col) return c
      }
      return null
    },
    getColumn(col) {
      return cells.filter((c) => c.col === col)
    },
    getRow(row) {
      return cells.filter((c) => c.row === row)
    },
    dismissedFindings,
  }
}

describe('isHighPrecisionNumeric', () => {
  it('returns true for number with 4+ decimal places', () => {
    const cell = makeCell('A1', 0, 0, 0.12345)
    expect(isHighPrecisionNumeric(cell)).toBe(true)
  })

  it('returns true for number with exactly 4 decimal places', () => {
    const cell = makeCell('A1', 0, 0, 0.1234)
    expect(isHighPrecisionNumeric(cell)).toBe(true)
  })

  it('returns false for number with fewer than 4 decimal places', () => {
    const cell = makeCell('A1', 0, 0, 0.123)
    expect(isHighPrecisionNumeric(cell)).toBe(false)
  })

  it('returns false for integer values', () => {
    const cell = makeCell('A1', 0, 0, 42)
    expect(isHighPrecisionNumeric(cell)).toBe(false)
  })

  it('returns false for formula cells even with high-precision computed value', () => {
    const cell = makeFormulaCell('A1', 0, 0, '=B1*0.12345')
    expect(isHighPrecisionNumeric(cell)).toBe(false)
  })

  it('returns false for NaN or Infinity', () => {
    const nanCell: CellInfo = {
      cellId: 'A1',
      row: 0,
      col: 0,
      rawValue: NaN,
      formula: null,
      computedValue: 'NaN',
      type: 'number',
    }
    expect(isHighPrecisionNumeric(nanCell)).toBe(false)

    const infCell: CellInfo = {
      cellId: 'A1',
      row: 0,
      col: 0,
      rawValue: Infinity,
      formula: null,
      computedValue: 'Infinity',
      type: 'number',
    }
    expect(isHighPrecisionNumeric(infCell)).toBe(false)
  })

  it('returns false for string cells', () => {
    const cell: CellInfo = {
      cellId: 'A1',
      row: 0,
      col: 0,
      rawValue: 'hello',
      formula: null,
      computedValue: 'hello',
      type: 'string',
    }
    expect(isHighPrecisionNumeric(cell)).toBe(false)
  })
})

describe('findContiguousRuns', () => {
  it('finds a run of 4 high-precision cells in a row', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
      makeCell('D1', 0, 3, 0.99999),
    ]
    const runs = findContiguousRuns(cells, 'row')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(4)
  })

  it('does not flag a run of fewer than 4 cells', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
    ]
    const runs = findContiguousRuns(cells, 'row')
    expect(runs).toHaveLength(0)
  })

  it('splits runs at gaps', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      // gap at col 2
      makeCell('D1', 0, 3, 0.11111),
      makeCell('E1', 0, 4, 0.99999),
      makeCell('F1', 0, 5, 0.22222),
      makeCell('G1', 0, 6, 0.33333),
    ]
    const runs = findContiguousRuns(cells, 'row')
    expect(runs).toHaveLength(1) // only D1:G1 (4 cells)
    expect(runs[0][0].cellId).toBe('D1')
  })

  it('splits runs at non-high-precision values', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 5), // not high precision — breaks run
      makeCell('D1', 0, 3, 0.11111),
      makeCell('E1', 0, 4, 0.99999),
    ]
    const runs = findContiguousRuns(cells, 'row')
    expect(runs).toHaveLength(0) // neither sub-run reaches 4
  })

  it('finds runs in columns', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('A2', 1, 0, 0.67891),
      makeCell('A3', 2, 0, 0.11111),
      makeCell('A4', 3, 0, 0.99999),
      makeCell('A5', 4, 0, 0.55555),
    ]
    const runs = findContiguousRuns(cells, 'col')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(5)
  })

  it('handles unsorted input correctly', () => {
    const cells = [
      makeCell('D1', 0, 3, 0.99999),
      makeCell('A1', 0, 0, 0.12345),
      makeCell('C1', 0, 2, 0.11111),
      makeCell('B1', 0, 1, 0.67891),
    ]
    const runs = findContiguousRuns(cells, 'row')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toHaveLength(4)
  })
})

describe('isSuppressed', () => {
  it('returns false when no dismissed entry exists', () => {
    const cells = [makeCell('A1', 0, 0, 0.12345)]
    expect(isSuppressed(cells, undefined)).toBe(false)
  })

  it('returns true when all cells are in dismissed list and values unchanged', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
    ]
    const dismissed: DismissedFindingEntry = {
      cellIds: ['A1', 'B1'],
      dismissedAt: Date.now(),
      valueSnapshot: { A1: 0.12345, B1: 0.67891 },
    }
    expect(isSuppressed(cells, dismissed)).toBe(true)
  })

  it('returns false when a cell value has changed since dismissal', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.99999), // changed from 0.12345
      makeCell('B1', 0, 1, 0.67891),
    ]
    const dismissed: DismissedFindingEntry = {
      cellIds: ['A1', 'B1'],
      dismissedAt: Date.now(),
      valueSnapshot: { A1: 0.12345, B1: 0.67891 },
    }
    expect(isSuppressed(cells, dismissed)).toBe(false)
  })

  it('returns false when not all cells are in the dismissed list', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
    ]
    const dismissed: DismissedFindingEntry = {
      cellIds: ['A1', 'B1'], // C1 not dismissed
      dismissedAt: Date.now(),
      valueSnapshot: { A1: 0.12345, B1: 0.67891 },
    }
    expect(isSuppressed(cells, dismissed)).toBe(false)
  })

  it('returns true when no value snapshot is provided (legacy dismissal)', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
    ]
    const dismissed: DismissedFindingEntry = {
      cellIds: ['A1', 'B1'],
      dismissedAt: Date.now(),
    }
    expect(isSuppressed(cells, dismissed)).toBe(true)
  })
})

describe('hardcodedWeightsRule.run', () => {
  it('flags a row with 4+ consecutive high-precision cells', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
      makeCell('D1', 0, 3, 0.99999),
    ]
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].ruleId).toBe('hardcoded-weights')
    expect(findings[0].severity).toBe('medium')
    expect(findings[0].cells).toHaveLength(4)
    expect(findings[0].suggestion).toContain('Model_Asset')
  })

  it('flags a column with 4+ consecutive high-precision cells', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('A2', 1, 0, 0.67891),
      makeCell('A3', 2, 0, 0.11111),
      makeCell('A4', 3, 0, 0.99999),
    ]
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].cells).toHaveLength(4)
  })

  it('does not flag fewer than 4 consecutive high-precision cells', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
    ]
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(0)
  })

  it('does not flag cells with low precision numbers', () => {
    const cells = [
      makeCell('A1', 0, 0, 1.5),
      makeCell('B1', 0, 1, 2.3),
      makeCell('C1', 0, 2, 4.7),
      makeCell('D1', 0, 3, 8.1),
    ]
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(0)
  })

  it('does not flag formula cells even with high-precision computed values', () => {
    const cells = [
      makeFormulaCell('A1', 0, 0, '=0.12345*2'),
      makeFormulaCell('B1', 0, 1, '=0.67891*2'),
      makeFormulaCell('C1', 0, 2, '=0.11111*2'),
      makeFormulaCell('D1', 0, 3, '=0.99999*2'),
    ]
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(0)
  })

  it('does not produce duplicate findings when cells form both row and column runs', () => {
    // A 4x4 grid of high precision values — rows and columns both qualify
    const cells: CellInfo[] = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const cellId = `${String.fromCharCode(65 + col)}${row + 1}`
        cells.push(makeCell(cellId, row, col, 0.12345 + row * 0.1 + col * 0.01))
      }
    }
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    // Should have findings for rows and columns, but no exact duplicates
    const findingKeys = findings.map((f) => f.cells.map((c) => c.cellId).sort().join(','))
    const uniqueKeys = new Set(findingKeys)
    expect(findingKeys.length).toBe(uniqueKeys.size)
  })

  it('suppresses findings for dismissed cells with unchanged values', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.12345),
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
      makeCell('D1', 0, 3, 0.99999),
    ]
    const dismissed: Record<string, DismissedFindingEntry> = {
      'hardcoded-weights': {
        cellIds: ['A1', 'B1', 'C1', 'D1'],
        dismissedAt: Date.now(),
        valueSnapshot: { A1: 0.12345, B1: 0.67891, C1: 0.11111, D1: 0.99999 },
      },
    }
    const ctx = buildContext(cells, dismissed)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(0)
  })

  it('re-reports findings when a dismissed cell value changes', () => {
    const cells = [
      makeCell('A1', 0, 0, 0.55555), // changed!
      makeCell('B1', 0, 1, 0.67891),
      makeCell('C1', 0, 2, 0.11111),
      makeCell('D1', 0, 3, 0.99999),
    ]
    const dismissed: Record<string, DismissedFindingEntry> = {
      'hardcoded-weights': {
        cellIds: ['A1', 'B1', 'C1', 'D1'],
        dismissedAt: Date.now(),
        valueSnapshot: { A1: 0.12345, B1: 0.67891, C1: 0.11111, D1: 0.99999 },
      },
    }
    const ctx = buildContext(cells, dismissed)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].cells).toHaveLength(4)
  })

  it('handles mixed content in a row — only flags the qualifying run', () => {
    const cells = [
      makeCell('A1', 0, 0, 42),       // integer
      makeCell('B1', 0, 1, 0.12345),
      makeCell('C1', 0, 2, 0.67891),
      makeCell('D1', 0, 3, 0.11111),
      makeCell('E1', 0, 4, 0.99999),
      makeCell('F1', 0, 5, 0.22222),
      makeCell('G1', 0, 6, 100),       // integer
    ]
    const ctx = buildContext(cells)
    const findings = hardcodedWeightsRule.run(ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].cells).toHaveLength(5) // B1 through F1
    expect(findings[0].cells[0].cellId).toBe('B1')
    expect(findings[0].cells[4].cellId).toBe('F1')
  })
})
