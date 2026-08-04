/**
 * ONNX Input Validator
 *
 * Validates cell range data and constructs input tensors for ONNX model inference.
 * Handles numeric validation, formula error exclusion, shape matching, and
 * row-major tensor construction.
 */

import type { TensorData, ValidationError } from './types';

/** Represents a single cell in the input range */
export interface CellInfo {
  /** Cell reference (e.g. "A1", "B3") */
  cellId: string;
  /** Raw cell value */
  value: unknown;
  /** Whether the cell contains a formula error */
  hasFormulaError?: boolean;
  /** The type of formula error if present (e.g. "#REF!", "#VALUE!") */
  formulaErrorType?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  /** Constructed tensor (only if valid) */
  tensor?: TensorData;
  /** Cells that were skipped due to formula errors */
  skippedCells?: { cellId: string; errorType: string }[];
  /** Whether remaining cells still satisfy input shape after exclusions */
  shapesSatisfied: boolean;
}

/** Known formula error patterns */
const FORMULA_ERROR_PATTERNS = ['#REF!', '#VALUE!', '#NAME?', '#DIV/0!', '#NULL!', '#N/A', '#NUM!'];

/**
 * Checks if a cell value represents a formula error.
 */
function isFormulaError(cell: CellInfo): boolean {
  if (cell.hasFormulaError) return true;
  if (typeof cell.value === 'string') {
    const upper = cell.value.toUpperCase().trim();
    return FORMULA_ERROR_PATTERNS.some((pattern) => upper === pattern);
  }
  return false;
}

/**
 * Returns the formula error type for a cell.
 */
function getFormulaErrorType(cell: CellInfo): string {
  if (cell.formulaErrorType) return cell.formulaErrorType;
  if (typeof cell.value === 'string') {
    const upper = cell.value.toUpperCase().trim();
    const match = FORMULA_ERROR_PATTERNS.find((pattern) => upper === pattern);
    if (match) return match;
  }
  return 'UNKNOWN';
}

/**
 * Validates that a value is numeric (finite number, not NaN, not empty, not text).
 */
function validateNumericValue(
  cell: CellInfo,
): { valid: true; value: number } | { valid: false; error: ValidationError } {
  const { cellId, value } = cell;

  // Empty check
  if (value === null || value === undefined || value === '') {
    return {
      valid: false,
      error: {
        cellId,
        value,
        reason: 'empty',
        message: `Cell ${cellId} is empty`,
      },
    };
  }

  // NaN check (explicit NaN value)
  if (typeof value === 'number' && isNaN(value)) {
    return {
      valid: false,
      error: {
        cellId,
        value,
        reason: 'nan',
        message: `Cell ${cellId} contains NaN`,
      },
    };
  }

  // Numeric conversion
  if (typeof value === 'number' && isFinite(value)) {
    return { valid: true, value };
  }

  // String that can be parsed as a number
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return {
        valid: false,
        error: {
          cellId,
          value,
          reason: 'empty',
          message: `Cell ${cellId} is empty`,
        },
      };
    }
    const parsed = Number(trimmed);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return { valid: true, value: parsed };
    }
    return {
      valid: false,
      error: {
        cellId,
        value,
        reason: 'non_numeric',
        message: `Cell ${cellId} contains non-numeric value: "${value}"`,
      },
    };
  }

  // Boolean or other non-numeric types
  return {
    valid: false,
    error: {
      cellId,
      value,
      reason: 'non_numeric',
      message: `Cell ${cellId} contains non-numeric value: ${String(value)}`,
    },
  };
}

/**
 * Checks whether the valid cell count satisfies the model's expected input shape.
 *
 * Shape rules:
 * - A dimension of -1 means "any" (batch dimension, inferred at runtime)
 * - Fixed dimensions must match exactly
 * - The total element count must equal the product of fixed dimensions
 *   (with -1 dimensions inferred from remaining count)
 */
function checkShapeSatisfied(
  validCount: number,
  expectedShape: number[],
  rangeDims: { rows: number; cols: number },
): boolean {
  if (expectedShape.length === 0) {
    // Scalar: exactly 1 value needed
    return validCount === 1;
  }

  // Count how many dynamic dimensions exist
  const dynamicDims = expectedShape.filter((d) => d === -1).length;
  const fixedProduct = expectedShape
    .filter((d) => d !== -1)
    .reduce((acc, d) => acc * d, 1);

  if (dynamicDims === 0) {
    // All dimensions are fixed — total elements must match exactly
    const totalExpected = expectedShape.reduce((acc, d) => acc * d, 1);
    return validCount === totalExpected;
  }

  if (dynamicDims === 1) {
    // One dynamic dimension — valid count must be divisible by the fixed product
    if (fixedProduct === 0) return false;
    return validCount > 0 && validCount % fixedProduct === 0;
  }

  // Multiple dynamic dimensions — cannot validate shape precisely,
  // just check that we have at least fixedProduct elements
  if (fixedProduct === 0) return validCount > 0;
  return validCount > 0 && validCount % fixedProduct === 0;
}

/**
 * Infers the actual tensor dimensions from the valid count and expected shape.
 */
function inferDims(validCount: number, expectedShape: number[]): number[] {
  if (expectedShape.length === 0) {
    return [1];
  }

  const dynamicDims = expectedShape.filter((d) => d === -1).length;

  if (dynamicDims === 0) {
    return [...expectedShape];
  }

  const fixedProduct = expectedShape
    .filter((d) => d !== -1)
    .reduce((acc, d) => acc * d, 1);

  if (dynamicDims === 1 && fixedProduct > 0) {
    const inferredSize = validCount / fixedProduct;
    return expectedShape.map((d) => (d === -1 ? inferredSize : d));
  }

  // Fallback for multiple dynamic dims — use rangeDims-based shape
  return expectedShape.map((d) => (d === -1 ? validCount / fixedProduct : d));
}

/**
 * Validates cell range data and constructs an input tensor.
 *
 * Steps:
 * 1. Extract raw values from the cell range
 * 2. Identify and exclude formula error cells (#REF!, #VALUE!, etc.)
 * 3. Validate remaining values are numeric (reject NaN, empty, text)
 * 4. Check that remaining valid cells satisfy model input shape
 * 5. Construct Float32Array tensor in row-major order
 */
export function validateAndConstructTensor(
  cells: CellInfo[],
  expectedShape: number[],
  rangeDims: { rows: number; cols: number },
): ValidationResult {
  const errors: ValidationError[] = [];
  const skippedCells: { cellId: string; errorType: string }[] = [];
  const validValues: number[] = [];

  // Process cells in row-major order (they should already be in this order)
  for (const cell of cells) {
    // Step 1: Check for formula errors — skip these cells
    if (isFormulaError(cell)) {
      skippedCells.push({
        cellId: cell.cellId,
        errorType: getFormulaErrorType(cell),
      });
      continue;
    }

    // Step 2: Validate numeric value
    const result = validateNumericValue(cell);
    if (result.valid) {
      validValues.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  // Step 3: Check shape satisfaction with remaining valid cells
  const shapesSatisfied = checkShapeSatisfied(validValues.length, expectedShape, rangeDims);

  // If there are validation errors (non-numeric cells) and shape is not satisfied, abort
  if (!shapesSatisfied) {
    // Add a shape mismatch error if we have some valid values but they don't satisfy shape
    if (validValues.length > 0 || errors.length === 0) {
      const expectedTotal = expectedShape.filter((d) => d !== -1).reduce((acc, d) => acc * d, 1);
      errors.push({
        cellId: '',
        value: validValues.length,
        reason: 'shape_mismatch',
        message: `Remaining valid cells (${validValues.length}) do not satisfy expected input shape [${expectedShape.join(', ')}]. Expected a multiple of ${expectedTotal} elements.`,
      });
    }

    return {
      valid: false,
      errors,
      skippedCells: skippedCells.length > 0 ? skippedCells : undefined,
      shapesSatisfied: false,
    };
  }

  // If there are non-numeric errors but shape is still satisfied,
  // this means the non-formula-error invalid cells prevent tensor construction
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      skippedCells: skippedCells.length > 0 ? skippedCells : undefined,
      shapesSatisfied,
    };
  }

  // Step 4: Construct Float32Array tensor in row-major order
  const data = new Float32Array(validValues);
  const dims = inferDims(validValues.length, expectedShape);

  return {
    valid: true,
    errors: [],
    tensor: {
      data,
      dims,
      dtype: 'float32',
    },
    skippedCells: skippedCells.length > 0 ? skippedCells : undefined,
    shapesSatisfied: true,
  };
}
