import { describe, expect, it } from 'vitest';
import { validateAndConstructTensor, type CellInfo } from './inputValidator';

describe('validateAndConstructTensor', () => {
  describe('numeric validation', () => {
    it('accepts valid numeric values', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
        { cellId: 'A2', value: 3 },
        { cellId: 'B2', value: 4 },
      ];
      const result = validateAndConstructTensor(cells, [2, 2], { rows: 2, cols: 2 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.tensor).toBeDefined();
      expect(Array.from(result.tensor!.data)).toEqual([1, 2, 3, 4]);
      expect(result.tensor!.dims).toEqual([2, 2]);
      expect(result.tensor!.dtype).toBe('float32');
    });

    it('accepts numeric strings', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '1.5' },
        { cellId: 'B1', value: '2.5' },
        { cellId: 'A2', value: '3.5' },
        { cellId: 'B2', value: '4.5' },
      ];
      const result = validateAndConstructTensor(cells, [2, 2], { rows: 2, cols: 2 });
      expect(result.valid).toBe(true);
      expect(result.tensor).toBeDefined();
      expect(result.tensor!.data[0]).toBeCloseTo(1.5);
      expect(result.tensor!.data[1]).toBeCloseTo(2.5);
    });

    it('rejects NaN values with per-cell error', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: NaN },
        { cellId: 'A2', value: 3 },
        { cellId: 'B2', value: 4 },
      ];
      const result = validateAndConstructTensor(cells, [2, 2], { rows: 2, cols: 2 });
      expect(result.valid).toBe(false);
      const nanError = result.errors.find((e) => e.cellId === 'B1');
      expect(nanError).toBeDefined();
      expect(nanError!.reason).toBe('nan');
      expect(nanError!.message).toContain('B1');
      expect(nanError!.message).toContain('NaN');
    });

    it('rejects empty strings with per-cell error', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '' },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      const emptyError = result.errors.find((e) => e.cellId === 'A1');
      expect(emptyError).toBeDefined();
      expect(emptyError!.reason).toBe('empty');
      expect(emptyError!.message).toContain('A1');
    });

    it('rejects whitespace-only strings as empty', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '   ' },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.cellId === 'A1');
      expect(error).toBeDefined();
      expect(error!.reason).toBe('empty');
    });

    it('rejects non-numeric text with per-cell error', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 'hello' },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      const textError = result.errors.find((e) => e.cellId === 'A1');
      expect(textError).toBeDefined();
      expect(textError!.reason).toBe('non_numeric');
      expect(textError!.message).toContain('A1');
      expect(textError!.message).toContain('hello');
    });

    it('rejects null values as empty', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: null },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.cellId === 'A1');
      expect(error!.reason).toBe('empty');
    });

    it('rejects undefined values as empty', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: undefined },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.cellId === 'A1');
      expect(error!.reason).toBe('empty');
    });

    it('rejects boolean values as non-numeric', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: true },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      const error = result.errors.find((e) => e.cellId === 'A1');
      expect(error!.reason).toBe('non_numeric');
    });
  });

  describe('formula error handling', () => {
    it('excludes cells with #REF! formula errors', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: '#REF!' },
        { cellId: 'A2', value: 3 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 1], { rows: 3, cols: 1 });
      expect(result.valid).toBe(true);
      expect(result.skippedCells).toHaveLength(1);
      expect(result.skippedCells![0]).toEqual({ cellId: 'B1', errorType: '#REF!' });
      expect(Array.from(result.tensor!.data)).toEqual([1, 3]);
    });

    it('excludes cells with #VALUE! formula errors', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '#VALUE!' },
        { cellId: 'B1', value: 2 },
        { cellId: 'C1', value: 3 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 1], { rows: 1, cols: 3 });
      expect(result.valid).toBe(true);
      expect(result.skippedCells).toHaveLength(1);
      expect(result.skippedCells![0].errorType).toBe('#VALUE!');
      expect(Array.from(result.tensor!.data)).toEqual([2, 3]);
    });

    it('excludes cells with hasFormulaError flag', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 'something', hasFormulaError: true, formulaErrorType: '#DIV/0!' },
        { cellId: 'C1', value: 3 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 1], { rows: 1, cols: 3 });
      expect(result.valid).toBe(true);
      expect(result.skippedCells).toHaveLength(1);
      expect(result.skippedCells![0]).toEqual({ cellId: 'B1', errorType: '#DIV/0!' });
    });

    it('handles multiple formula errors', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '#REF!' },
        { cellId: 'B1', value: '#VALUE!' },
        { cellId: 'C1', value: 5 },
        { cellId: 'D1', value: 10 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 1], { rows: 1, cols: 4 });
      expect(result.valid).toBe(true);
      expect(result.skippedCells).toHaveLength(2);
      expect(Array.from(result.tensor!.data)).toEqual([5, 10]);
    });

    it('case-insensitive formula error detection', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '#ref!' },
        { cellId: 'B1', value: 5 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 1], { rows: 1, cols: 2 });
      expect(result.valid).toBe(true);
      expect(result.skippedCells).toHaveLength(1);
    });
  });

  describe('shape validation', () => {
    it('validates exact shape [2, 3]', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
        { cellId: 'C1', value: 3 },
        { cellId: 'A2', value: 4 },
        { cellId: 'B2', value: 5 },
        { cellId: 'C2', value: 6 },
      ];
      const result = validateAndConstructTensor(cells, [2, 3], { rows: 2, cols: 3 });
      expect(result.valid).toBe(true);
      expect(result.shapesSatisfied).toBe(true);
      expect(result.tensor!.dims).toEqual([2, 3]);
    });

    it('rejects when element count does not match fixed shape', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
        { cellId: 'C1', value: 3 },
      ];
      const result = validateAndConstructTensor(cells, [2, 3], { rows: 1, cols: 3 });
      expect(result.valid).toBe(false);
      expect(result.shapesSatisfied).toBe(false);
      const shapeError = result.errors.find((e) => e.reason === 'shape_mismatch');
      expect(shapeError).toBeDefined();
    });

    it('handles batch dimension -1 (inferred)', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
        { cellId: 'C1', value: 3 },
        { cellId: 'A2', value: 4 },
        { cellId: 'B2', value: 5 },
        { cellId: 'C2', value: 6 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 3], { rows: 2, cols: 3 });
      expect(result.valid).toBe(true);
      expect(result.shapesSatisfied).toBe(true);
      expect(result.tensor!.dims).toEqual([2, 3]);
    });

    it('rejects when remaining valid cells not divisible by fixed dimensions', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
        { cellId: 'C1', value: 3 },
        { cellId: 'D1', value: 4 },
        { cellId: 'E1', value: 5 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 3], { rows: 1, cols: 5 });
      expect(result.valid).toBe(false);
      expect(result.shapesSatisfied).toBe(false);
    });

    it('aborts if remaining valid cells after exclusions do not satisfy shape', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: '#REF!' },
        { cellId: 'C1', value: 3 },
        { cellId: 'D1', value: 4 },
        { cellId: 'E1', value: '#VALUE!' },
      ];
      // After exclusions: 3 valid cells, shape requires multiples of 4
      const result = validateAndConstructTensor(cells, [1, 4], { rows: 1, cols: 5 });
      expect(result.valid).toBe(false);
      expect(result.shapesSatisfied).toBe(false);
      expect(result.skippedCells).toHaveLength(2);
    });

    it('handles scalar shape (empty array)', () => {
      const cells: CellInfo[] = [{ cellId: 'A1', value: 42 }];
      const result = validateAndConstructTensor(cells, [], { rows: 1, cols: 1 });
      expect(result.valid).toBe(true);
      expect(result.tensor!.dims).toEqual([1]);
      expect(Array.from(result.tensor!.data)).toEqual([42]);
    });

    it('handles 1-D shape', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'A2', value: 2 },
        { cellId: 'A3', value: 3 },
      ];
      const result = validateAndConstructTensor(cells, [3], { rows: 3, cols: 1 });
      expect(result.valid).toBe(true);
      expect(result.tensor!.dims).toEqual([3]);
    });
  });

  describe('tensor construction', () => {
    it('constructs tensor in row-major order', () => {
      // 3x3 grid as described in the design doc example
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1.0 },
        { cellId: 'B1', value: 2.0 },
        { cellId: 'C1', value: 3.0 },
        { cellId: 'A2', value: 4.0 },
        { cellId: 'B2', value: 5.0 },
        { cellId: 'C2', value: 6.0 },
        { cellId: 'A3', value: 7.0 },
        { cellId: 'B3', value: 8.0 },
        { cellId: 'C3', value: 9.0 },
      ];
      const result = validateAndConstructTensor(cells, [-1, 3], { rows: 3, cols: 3 });
      expect(result.valid).toBe(true);
      expect(Array.from(result.tensor!.data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(result.tensor!.dims).toEqual([3, 3]);
    });

    it('produces Float32Array for output', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.tensor!.data).toBeInstanceOf(Float32Array);
    });

    it('preserves numeric precision within Float32 limits', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 3.14159 },
        { cellId: 'B1', value: -2.71828 },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(true);
      expect(result.tensor!.data[0]).toBeCloseTo(3.14159, 4);
      expect(result.tensor!.data[1]).toBeCloseTo(-2.71828, 4);
    });
  });

  describe('complete validation flow', () => {
    it('reports all invalid cells even when shape fails', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 'text' },
        { cellId: 'B1', value: '' },
        { cellId: 'C1', value: NaN },
      ];
      const result = validateAndConstructTensor(cells, [3], { rows: 1, cols: 3 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('returns valid=false with errors when mix of valid and invalid cells', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 'bad' },
        { cellId: 'C1', value: 3 },
      ];
      const result = validateAndConstructTensor(cells, [3], { rows: 1, cols: 3 });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.cellId === 'B1')).toBe(true);
    });

    it('returns undefined tensor when invalid', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 'text' },
      ];
      const result = validateAndConstructTensor(cells, [1], { rows: 1, cols: 1 });
      expect(result.valid).toBe(false);
      expect(result.tensor).toBeUndefined();
    });

    it('handles empty input (no cells)', () => {
      const result = validateAndConstructTensor([], [1], { rows: 0, cols: 0 });
      expect(result.valid).toBe(false);
      expect(result.shapesSatisfied).toBe(false);
    });

    it('handles all cells being formula errors', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: '#REF!' },
        { cellId: 'B1', value: '#VALUE!' },
      ];
      const result = validateAndConstructTensor(cells, [2], { rows: 1, cols: 2 });
      expect(result.valid).toBe(false);
      expect(result.shapesSatisfied).toBe(false);
      expect(result.skippedCells).toHaveLength(2);
    });

    it('succeeds when formula errors reduce count but shape still satisfied', () => {
      const cells: CellInfo[] = [
        { cellId: 'A1', value: 1 },
        { cellId: 'B1', value: 2 },
        { cellId: 'C1', value: 3 },
        { cellId: 'D1', value: '#REF!' },
      ];
      const result = validateAndConstructTensor(cells, [-1, 3], { rows: 1, cols: 4 });
      expect(result.valid).toBe(true);
      expect(result.shapesSatisfied).toBe(true);
      expect(result.skippedCells).toHaveLength(1);
      expect(Array.from(result.tensor!.data)).toEqual([1, 2, 3]);
      expect(result.tensor!.dims).toEqual([1, 3]);
    });
  });
});
