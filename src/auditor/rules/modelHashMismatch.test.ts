/**
 * Unit tests for the Model Hash Mismatch Detection rule.
 *
 * Tests the core behavior: detecting when a model's file hash differs from
 * its registered hash and flagging all referencing cells.
 *
 * Requirements: 8.3
 */

import { describe, expect, it } from 'vitest'
import { createModelHashMismatchRule, modelHashMismatchRule } from './modelHashMismatch'
import type { ModelHashContext } from './modelHashMismatch'
import type { AuditContext, CellInfo } from '../types'
import type { ModelAsset } from '@/onnx/types'

/** Helper to build a minimal CellInfo. */
function cell(cellId: string, row: number, col: number, formula: string | null = null): CellInfo {
  return {
    cellId,
    row,
    col,
    rawValue: formula ? null : 42,
    formula,
    computedValue: formula ? '42' : '42',
    type: formula ? 'formula' : 'number',
  }
}

/** Helper to build a minimal AuditContext. */
function buildContext(cells: CellInfo[]): AuditContext {
  const formulaCells = cells.filter((c) => c.formula)
  const maxRow = cells.reduce((max, c) => Math.max(max, c.row), 0)
  const maxCol = cells.reduce((max, c) => Math.max(max, c.col), 0)

  return {
    sheetName: 'TestSheet',
    allCells: cells,
    formulaCells,
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

/** Helper to build a ModelAsset. */
function modelAsset(name: string, hash: string): ModelAsset {
  return {
    name,
    hash,
    sizeBytes: 1024,
    opsetVersion: 13,
    inputShape: [-1, 4],
    inputDtype: 'float32',
    outputShape: [-1, 1],
    registeredAt: Date.now(),
    frequentlyUsed: false,
  }
}

describe('modelHashMismatchRule', () => {
  it('produces no findings when no model context is provided (default export)', () => {
    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("my_model", B1:B10)'),
    ])

    const findings = modelHashMismatchRule.run(ctx)
    expect(findings).toEqual([])
  })

  it('produces no findings when hashes match', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { linear_reg: modelAsset('linear_reg', 'abc123') },
      getCurrentHash: () => 'abc123',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("linear_reg", B1:B10)'),
      cell('A2', 1, 0, 'ONNX.RUN("linear_reg", B2:B10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('flags all referencing cells when hash differs', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { linear_reg: modelAsset('linear_reg', 'registered_hash') },
      getCurrentHash: () => 'different_hash',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("linear_reg", B1:B10)'),
      cell('A2', 1, 0, 'ONNX.RUN("linear_reg", B2:B10)'),
      cell('A3', 2, 0, 'SUM(B1:B10)'), // native formula — not flagged
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('high')
    expect(findings[0].ruleId).toBe('model-hash-mismatch')
    expect(findings[0].cells).toHaveLength(2)
    expect(findings[0].cells.map((c) => c.cellId)).toEqual(['A1', 'A2'])
    expect(findings[0].suggestion).toContain('Re-upload')
    expect(findings[0].suggestion).toContain('linear_reg')
  })

  it('handles multiple models with mixed match/mismatch', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: {
        model_a: modelAsset('model_a', 'hash_a'),
        model_b: modelAsset('model_b', 'hash_b_old'),
      },
      getCurrentHash: (name) => {
        if (name === 'model_a') return 'hash_a' // matches
        if (name === 'model_b') return 'hash_b_new' // mismatch
        return null
      },
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("model_a", B1:B10)'),
      cell('A2', 1, 0, 'ONNX.RUN("model_b", C1:C10)'),
      cell('A3', 2, 0, 'ONNX.RUN("model_b", C2:C10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toContain('model_b')
    expect(findings[0].cells).toHaveLength(2)
    expect(findings[0].cells.map((c) => c.cellId)).toEqual(['A2', 'A3'])
  })

  it('produces no findings when current hash cannot be determined (null)', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { missing_model: modelAsset('missing_model', 'hash_x') },
      getCurrentHash: () => null, // file missing or inaccessible
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("missing_model", B1:B10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('produces no findings when model has mismatched hash but no referencing cells', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { unused_model: modelAsset('unused_model', 'old_hash') },
      getCurrentHash: () => 'new_hash',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'SUM(B1:B10)'),
      cell('A2', 1, 0, 'AVERAGE(B1:B10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(0)
  })

  it('matches model names case-insensitively in formulas', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { My_Model: modelAsset('My_Model', 'old_hash') },
      getCurrentHash: () => 'new_hash',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("my_model", B1:B10)'),
      cell('A2', 1, 0, 'ONNX.RUN("MY_MODEL", B1:B10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].cells).toHaveLength(2)
  })

  it('handles single-quoted model names in formulas', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { test_model: modelAsset('test_model', 'hash_old') },
      getCurrentHash: () => 'hash_new',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, "ONNX.RUN('test_model', B1:B10)"),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(1)
    expect(findings[0].cells[0].cellId).toBe('A1')
  })

  it('handles unquoted model names in formulas', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { simple: modelAsset('simple', 'hash_v1') },
      getCurrentHash: () => 'hash_v2',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN(simple, B1:B10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(1)
  })

  it('rule has correct metadata', () => {
    expect(modelHashMismatchRule.id).toBe('model-hash-mismatch')
    expect(modelHashMismatchRule.name).toBe('Model Hash Mismatch')
    expect(modelHashMismatchRule.defaultSeverity).toBe('high')
    expect(modelHashMismatchRule.description).toContain('modified after registration')
  })

  it('findings are not auto-fixable', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: { m: modelAsset('m', 'old') },
      getCurrentHash: () => 'new',
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("m", B1:B5)'),
    ])

    const findings = rule.run(ctx)
    expect(findings[0].autoFixable).toBe(false)
  })

  it('produces separate findings for each mismatched model', () => {
    const hashCtx: ModelHashContext = {
      modelAssets: {
        model_x: modelAsset('model_x', 'x_old'),
        model_y: modelAsset('model_y', 'y_old'),
      },
      getCurrentHash: (name) => {
        if (name === 'model_x') return 'x_new'
        if (name === 'model_y') return 'y_new'
        return null
      },
    }
    const rule = createModelHashMismatchRule(hashCtx)

    const ctx = buildContext([
      cell('A1', 0, 0, 'ONNX.RUN("model_x", B1:B10)'),
      cell('A2', 1, 0, 'ONNX.RUN("model_y", C1:C10)'),
    ])

    const findings = rule.run(ctx)
    expect(findings).toHaveLength(2)
    expect(findings[0].title).toContain('model_x')
    expect(findings[1].title).toContain('model_y')
  })
})
