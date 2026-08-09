/**
 * Property-Based Tests for ONNX Input Validator
 *
 * Property 4: Input Validation and Tensor Construction
 * For any random cell array and expected shape:
 * - Non-numeric/NaN/empty values are rejected with per-cell errors
 * - Formula error cells are excluded (skipped) without producing errors
 * - Tensor is accepted only when remaining valid cells satisfy the shape
 * - Valid tensors contain values in row-major order as Float32Array
 *
 * Validates: Requirements 5.1, 5.2, 5.5, 5.6
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateAndConstructTensor, type CellInfo } from './inputValidator'

// ─── Arbitraries ────────────────────────────────────────────────────────────

/** Generates a valid cell reference like A1, B3, etc. */
const cellIdArb = fc.tuple(
  fc.constantFrom('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'),
  fc.integer({ min: 1, max: 100 }),
).map(([col, row]) => `${col}${row}`)

/** Generates a numeric cell (valid for tensor construction) */
const numericCellArb = fc.tuple(cellIdArb, fc.double({ min: -1e6, max: 1e6, noNaN: true }))
  .map(([cellId, value]): CellInfo => ({ cellId, value }))

/** Generates an invalid cell (NaN, empty, text, boolean) */
const invalidCellArb = fc.oneof(
  // NaN
  cellIdArb.map((cellId): CellInfo => ({ cellId, value: NaN })),
  // Empty string
  cellIdArb.map((cellId): CellInfo => ({ cellId, value: '' })),
  // null
  cellIdArb.map((cellId): CellInfo => ({ cellId, value: null })),
  // undefined
  cellIdArb.map((cellId): CellInfo => ({ cellId, value: undefined })),
  // Non-numeric text
  fc.tuple(cellIdArb, fc.string({ minLength: 1, maxLength: 10 }).filter(s => isNaN(Number(s))))
    .map(([cellId, value]): CellInfo => ({ cellId, value })),
  // Boolean
  fc.tuple(cellIdArb, fc.boolean())
    .map(([cellId, value]): CellInfo => ({ cellId, value })),
)

/** Generates a formula error cell */
const formulaErrorCellArb = fc.tuple(
  cellIdArb,
  fc.constantFrom('#REF!', '#VALUE!', '#NAME?', '#DIV/0!', '#NULL!', '#N/A', '#NUM!'),
).map(([cellId, errorType]): CellInfo => ({
  cellId,
  value: errorType,
  hasFormulaError: true,
  formulaErrorType: errorType,
}))

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 4: Input Validation and Tensor Construction', () => {
  it('rejects all non-numeric values with per-cell errors', () => {
    fc.assert(
      fc.property(
        fc.array(invalidCellArb, { minLength: 1, maxLength: 20 }),
        (cells) => {
          const result = validateAndConstructTensor(cells, [-1], { rows: cells.length, cols: 1 })

          // Should be invalid (no valid numeric values)
          expect(result.valid).toBe(false)
          // Each non-formula-error cell should produce an error
          expect(result.errors.length).toBeGreaterThan(0)
          // Every error must include a cellId and reason
          for (const err of result.errors) {
            expect(err.cellId).toBeTruthy()
            expect(err.reason).toBeTruthy()
          }
        },
      ),
      { numRuns: 50 },
    )
  })

  it('excludes formula error cells without producing errors', () => {
    fc.assert(
      fc.property(
        fc.array(formulaErrorCellArb, { minLength: 1, maxLength: 10 }),
        (errorCells) => {
          // Only formula errors — no valid data, so shape won't be satisfied
          const result = validateAndConstructTensor(errorCells, [-1], { rows: errorCells.length, cols: 1 })

          // Formula errors are skipped, not errored
          expect(result.skippedCells?.length).toBe(errorCells.length)
          // No validation errors (only shape mismatch since there are 0 valid values)
          const nonShapeErrors = result.errors.filter(e => e.reason !== 'shape_mismatch')
          expect(nonShapeErrors.length).toBe(0)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('accepts valid numeric arrays when shape is satisfied', () => {
    fc.assert(
      fc.property(
        // Generate a fixed shape dimension (cols), and a batch size (rows)
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 20 }),
        (cols, rows) => {
          // Generate exactly rows * cols numeric cells
          const cells: CellInfo[] = []
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const col = String.fromCharCode(65 + c)
              cells.push({ cellId: `${col}${r + 1}`, value: (r * cols + c) * 1.5 })
            }
          }

          const result = validateAndConstructTensor(cells, [-1, cols], { rows, cols })

          expect(result.valid).toBe(true)
          expect(result.shapesSatisfied).toBe(true)
          expect(result.tensor).toBeDefined()
          expect(result.tensor!.data).toHaveLength(rows * cols)
          // Verify row-major order: first element matches first cell's value
          expect(result.tensor!.data[0]).toBeCloseTo(0)
          expect(result.tensor!.data[1]).toBeCloseTo(1.5)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('rejects when remaining valid cells do not satisfy fixed shape', () => {
    fc.assert(
      fc.property(
        // Generate cells that don't match the shape
        fc.integer({ min: 1, max: 15 }),
        fc.integer({ min: 2, max: 8 }),
        (cellCount, shapeDim) => {
          // Ensure cellCount is NOT a multiple of shapeDim
          fc.pre(cellCount % shapeDim !== 0)

          const cells: CellInfo[] = Array.from({ length: cellCount }, (_, i) => ({
            cellId: `A${i + 1}`,
            value: i * 2.0,
          }))

          // Fixed shape (no batch dimension)
          const result = validateAndConstructTensor(cells, [shapeDim], { rows: cellCount, cols: 1 })

          expect(result.valid).toBe(false)
          expect(result.shapesSatisfied).toBe(false)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('mixed valid + invalid + formula-error cells: errors only for invalid, skips for formulas', () => {
    fc.assert(
      fc.property(
        fc.array(numericCellArb, { minLength: 1, maxLength: 10 }),
        fc.array(invalidCellArb, { minLength: 0, maxLength: 5 }),
        fc.array(formulaErrorCellArb, { minLength: 0, maxLength: 5 }),
        (validCells, invalidCells, errorCells) => {
          const allCells = [...validCells, ...invalidCells, ...errorCells]

          const result = validateAndConstructTensor(allCells, [-1], { rows: allCells.length, cols: 1 })

          // Formula errors should be skipped
          if (errorCells.length > 0) {
            expect(result.skippedCells?.length).toBe(errorCells.length)
          }

          // Invalid cells should produce errors
          if (invalidCells.length > 0) {
            expect(result.errors.length).toBeGreaterThanOrEqual(invalidCells.length)
          }
        },
      ),
      { numRuns: 30 },
    )
  })
})
