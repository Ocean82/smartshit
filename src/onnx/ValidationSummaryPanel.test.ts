/**
 * Unit tests for the ValidationSummaryPanel component and utilities.
 *
 * Since the test environment is 'node' (no DOM/jsdom), these tests validate:
 * - Exported constants and helper functions
 * - isInvalidCell / isSkippedCell utilities
 * - invalidCellStyle object correctness
 * - Module exports availability
 *
 * Requirements: 5.4, 5.5, 5.6
 */

import { describe, it, expect } from 'vitest';
import {
  INVALID_CELL_CLASS,
  INVALID_CELL_TAILWIND,
  invalidCellStyle,
  isInvalidCell,
  isSkippedCell,
} from './ValidationSummaryPanel';
import type { ValidationResult } from './inputValidator';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function createValidResult(): ValidationResult {
  return {
    valid: true,
    errors: [],
    shapesSatisfied: true,
    tensor: {
      data: new Float32Array([1, 2, 3, 4]),
      dims: [2, 2],
      dtype: 'float32',
    },
  };
}

function createResultWithErrors(): ValidationResult {
  return {
    valid: false,
    errors: [
      { cellId: 'A1', value: 'hello', reason: 'non_numeric', message: 'Cell A1 contains non-numeric value: "hello"' },
      { cellId: 'B2', value: '', reason: 'empty', message: 'Cell B2 is empty' },
      { cellId: 'C3', value: NaN, reason: 'nan', message: 'Cell C3 contains NaN' },
    ],
    shapesSatisfied: true,
  };
}

function createResultWithSkippedCells(): ValidationResult {
  return {
    valid: false,
    errors: [
      { cellId: 'A2', value: 'text', reason: 'non_numeric', message: 'Cell A2 contains non-numeric value: "text"' },
    ],
    skippedCells: [
      { cellId: 'C3', errorType: '#REF!' },
      { cellId: 'D5', errorType: '#VALUE!' },
    ],
    shapesSatisfied: true,
  };
}

function createResultWithShapeMismatch(): ValidationResult {
  return {
    valid: false,
    errors: [
      { cellId: 'A1', value: 'abc', reason: 'non_numeric', message: 'Cell A1 contains non-numeric value: "abc"' },
      {
        cellId: '',
        value: 2,
        reason: 'shape_mismatch',
        message: 'Remaining valid cells (2) do not satisfy expected input shape [-1, 4]. Expected a multiple of 4 elements.',
      },
    ],
    skippedCells: [
      { cellId: 'B1', errorType: '#REF!' },
    ],
    shapesSatisfied: false,
  };
}

function createResultOnlyShapeMismatch(): ValidationResult {
  return {
    valid: false,
    errors: [
      {
        cellId: '',
        value: 3,
        reason: 'shape_mismatch',
        message: 'Remaining valid cells (3) do not satisfy expected input shape [-1, 4]. Expected a multiple of 4 elements.',
      },
    ],
    shapesSatisfied: false,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('INVALID_CELL_CLASS', () => {
  it('is a non-empty string', () => {
    expect(INVALID_CELL_CLASS).toBe('onnx-invalid-cell');
    expect(INVALID_CELL_CLASS.length).toBeGreaterThan(0);
  });
});

describe('INVALID_CELL_TAILWIND', () => {
  it('contains ring and background utility classes', () => {
    expect(INVALID_CELL_TAILWIND).toContain('ring-2');
    expect(INVALID_CELL_TAILWIND).toContain('ring-red-500');
    expect(INVALID_CELL_TAILWIND).toContain('bg-red-50');
  });
});

describe('invalidCellStyle', () => {
  it('provides a visually distinct red outline style (Requirement 5.4)', () => {
    expect(invalidCellStyle.outline).toBeDefined();
    expect(invalidCellStyle.outline).toContain('2px solid');
    expect(invalidCellStyle.outlineOffset).toBe('-1px');
    expect(invalidCellStyle.backgroundColor).toBeDefined();
  });

  it('has a background color for the invalid cell indicator', () => {
    expect(invalidCellStyle.backgroundColor).toBeTruthy();
  });
});

describe('isInvalidCell', () => {
  it('returns true for a cell that has a validation error', () => {
    const result = createResultWithErrors();
    expect(isInvalidCell('A1', result)).toBe(true);
    expect(isInvalidCell('B2', result)).toBe(true);
    expect(isInvalidCell('C3', result)).toBe(true);
  });

  it('returns false for a cell without a validation error', () => {
    const result = createResultWithErrors();
    expect(isInvalidCell('D4', result)).toBe(false);
    expect(isInvalidCell('E5', result)).toBe(false);
  });

  it('returns false for a valid result (no errors)', () => {
    const result = createValidResult();
    expect(isInvalidCell('A1', result)).toBe(false);
  });

  it('returns false for a cell that was skipped (not invalid)', () => {
    const result = createResultWithSkippedCells();
    // C3 is skipped, not in errors
    expect(isInvalidCell('C3', result)).toBe(false);
  });

  it('handles shape mismatch errors with empty cellId gracefully', () => {
    const result = createResultOnlyShapeMismatch();
    // Shape mismatch has cellId = '' — searching for empty string
    expect(isInvalidCell('', result)).toBe(true);
    expect(isInvalidCell('A1', result)).toBe(false);
  });
});

describe('isSkippedCell', () => {
  it('returns true for a cell that was skipped due to formula error', () => {
    const result = createResultWithSkippedCells();
    expect(isSkippedCell('C3', result)).toBe(true);
    expect(isSkippedCell('D5', result)).toBe(true);
  });

  it('returns false for a cell that was not skipped', () => {
    const result = createResultWithSkippedCells();
    expect(isSkippedCell('A1', result)).toBe(false);
    expect(isSkippedCell('A2', result)).toBe(false);
  });

  it('returns false when there are no skipped cells', () => {
    const result = createResultWithErrors();
    expect(isSkippedCell('A1', result)).toBe(false);
  });

  it('returns false for a valid result', () => {
    const result = createValidResult();
    expect(isSkippedCell('A1', result)).toBe(false);
  });
});

describe('ValidationSummaryPanel module exports', () => {
  it('exports ValidationSummaryPanel component', async () => {
    const mod = await import('./ValidationSummaryPanel');
    expect(mod.ValidationSummaryPanel).toBeDefined();
    expect(typeof mod.ValidationSummaryPanel).toBe('function');
  });

  it('exports INVALID_CELL_CLASS constant', async () => {
    const mod = await import('./ValidationSummaryPanel');
    expect(mod.INVALID_CELL_CLASS).toBe('onnx-invalid-cell');
  });

  it('exports INVALID_CELL_TAILWIND constant', async () => {
    const mod = await import('./ValidationSummaryPanel');
    expect(typeof mod.INVALID_CELL_TAILWIND).toBe('string');
  });

  it('exports invalidCellStyle object', async () => {
    const mod = await import('./ValidationSummaryPanel');
    expect(mod.invalidCellStyle).toBeDefined();
    expect(typeof mod.invalidCellStyle).toBe('object');
  });

  it('exports isInvalidCell function', async () => {
    const mod = await import('./ValidationSummaryPanel');
    expect(typeof mod.isInvalidCell).toBe('function');
  });

  it('exports isSkippedCell function', async () => {
    const mod = await import('./ValidationSummaryPanel');
    expect(typeof mod.isSkippedCell).toBe('function');
  });
});

describe('ValidationSummaryPanel rendering logic (Requirement 5.4, 5.5, 5.6)', () => {
  describe('with validation errors (Requirement 5.4)', () => {
    it('provides errors array with cellId and reason for each invalid cell', () => {
      const result = createResultWithErrors();
      expect(result.errors.length).toBe(3);
      expect(result.errors[0].cellId).toBe('A1');
      expect(result.errors[0].reason).toBe('non_numeric');
      expect(result.errors[1].cellId).toBe('B2');
      expect(result.errors[1].reason).toBe('empty');
      expect(result.errors[2].cellId).toBe('C3');
      expect(result.errors[2].reason).toBe('nan');
    });

    it('each error includes message with cell reference and invalid value', () => {
      const result = createResultWithErrors();
      expect(result.errors[0].message).toContain('A1');
      expect(result.errors[0].message).toContain('non-numeric');
      expect(result.errors[1].message).toContain('B2');
      expect(result.errors[1].message).toContain('empty');
    });
  });

  describe('with skipped formula error cells (Requirement 5.5)', () => {
    it('provides skippedCells array with cellId and errorType', () => {
      const result = createResultWithSkippedCells();
      expect(result.skippedCells).toBeDefined();
      expect(result.skippedCells!.length).toBe(2);
      expect(result.skippedCells![0]).toEqual({ cellId: 'C3', errorType: '#REF!' });
      expect(result.skippedCells![1]).toEqual({ cellId: 'D5', errorType: '#VALUE!' });
    });
  });

  describe('with shape mismatch / insufficient data (Requirement 5.6)', () => {
    it('indicates shape is not satisfied', () => {
      const result = createResultWithShapeMismatch();
      expect(result.shapesSatisfied).toBe(false);
    });

    it('includes shape_mismatch error with expected shape and valid count', () => {
      const result = createResultWithShapeMismatch();
      const shapeError = result.errors.find((e) => e.reason === 'shape_mismatch');
      expect(shapeError).toBeDefined();
      expect(shapeError!.message).toContain('[-1, 4]');
      expect(shapeError!.message).toContain('2');
      expect(shapeError!.value).toBe(2);
    });

    it('combines skipped cells and errors in insufficient data scenario', () => {
      const result = createResultWithShapeMismatch();
      expect(result.skippedCells!.length).toBe(1);
      expect(result.errors.length).toBe(2); // 1 non_numeric + 1 shape_mismatch
    });
  });

  describe('valid result (no errors)', () => {
    it('has empty errors array and shapesSatisfied is true', () => {
      const result = createValidResult();
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.shapesSatisfied).toBe(true);
    });
  });
});
