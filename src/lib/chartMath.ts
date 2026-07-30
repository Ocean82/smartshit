/**
 * Chart Math Utilities
 *
 * Extracted from ChartRenderer.tsx to enable sharing and testing.
 */

export interface LinearRegressionResult {
  slope: number;
  intercept: number;
}

/** Simple linear regression (y = mx + b) */
export function linearRegression(values: number[]): LinearRegressionResult {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Trend line configuration */
export type TrendLineType = 'linear' | 'movingAverage' | 'exponential' | 'polynomial';

export interface TrendLineConfig {
  type: TrendLineType;
  period?: number;    // for movingAverage
  degree?: number;    // for polynomial (2-4)
}

/** Compute trend line values for a dataset */
export function computeTrendValues(values: number[], config: TrendLineConfig): number[] {
  const n = values.length;
  if (n < 2) return values;

  switch (config.type) {
    case 'linear': {
      const { slope, intercept } = linearRegression(values);
      return values.map((_, i) => slope * i + intercept);
    }
    case 'movingAverage': {
      const period = config.period || 3;
      return values.map((_, i) => {
        const start = Math.max(0, i - period + 1);
        const window = values.slice(start, i + 1);
        return window.reduce((a, b) => a + b, 0) / window.length;
      });
    }
    case 'exponential': {
      // ln(y) = a + bx → y = e^(a+bx)
      const logValues = values.map((v) => (v > 0 ? Math.log(v) : 0));
      const { slope, intercept } = linearRegression(logValues);
      return values.map((_, i) => Math.exp(intercept + slope * i));
    }
    case 'polynomial': {
      const degree = Math.min(config.degree || 2, 4);
      const coeffs = polyFit(values, degree);
      return values.map((_, i) => {
        let y = 0;
        for (let d = 0; d <= degree; d++) y += coeffs[d] * Math.pow(i, d);
        return y;
      });
    }
    default:
      return values;
  }
}

/** Least-squares polynomial fit (degree 2–4). Returns coefficients [a0, a1, ..., an]. */
export function polyFit(values: number[], degree: number): number[] {
  const n = values.length;
  const size = degree + 1;
  // Build normal equations: X^T * X * a = X^T * y
  const matrix: number[][] = Array.from({ length: size }, () => Array(size + 1).fill(0));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (let i = 0; i < n; i++) {
        matrix[row][col] += Math.pow(i, row + col);
      }
    }
    for (let i = 0; i < n; i++) {
      matrix[row][size] += values[i] * Math.pow(i, row);
    }
  }
  // Gaussian elimination
  for (let col = 0; col < size; col++) {
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[maxRow][col])) maxRow = row;
    }
    [matrix[col], matrix[maxRow]] = [matrix[maxRow], matrix[col]];
    const pivot = matrix[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let j = col; j <= size; j++) matrix[col][j] /= pivot;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let j = col; j <= size; j++) matrix[row][j] -= factor * matrix[col][j];
    }
  }
  return matrix.map((row) => row[size]);
}

/** Format trend line equation for display */
export function formatTrendEquation(values: number[], config: TrendLineConfig): string {
  if (config.type === 'linear') {
    const { slope, intercept } = linearRegression(values);
    const sign = intercept >= 0 ? '+' : '-';
    return `y = ${slope.toFixed(2)}x ${sign} ${Math.abs(intercept).toFixed(2)}`;
  }
  if (config.type === 'movingAverage') return `MA(${config.period || 3})`;
  if (config.type === 'exponential') return 'y = ae^(bx)';
  return `poly(${config.degree || 2})`;
}

// --- Range & Cell Reference Utilities ---

/**
 * Parse a cell reference like "A1" into { row, col } (0-based).
 * Returns null if invalid.
 */
export function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.toUpperCase().match(/^([A-Z]{1,3})(\d{1,7})$/);
  if (!match) return null;
  const col = columnLetterToIndex(match[1]);
  const row = parseInt(match[2], 10) - 1;
  return row >= 0 ? { row, col } : null;
}

/**
 * Parse a range like "A1:B10" into start/end refs.
 * Returns null if invalid.
 */
export function parseRangeRef(range: string): { start: { row: number; col: number }; end: { row: number; col: number } } | null {
  const match = range.toUpperCase().match(/^([A-Z]{1,3}\d{1,7}):([A-Z]{1,3}\d{1,7})$/);
  if (!match) return null;
  const start = parseCellRef(match[1]);
  const end = parseCellRef(match[2]);
  return start && end ? { start, end } : null;
}

/**
 * Convert column letters (A, Z, AA, AB...) to 0-based index.
 */
export function columnLetterToIndex(letters: string): number {
  let result = 0;
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 64);
  }
  return result - 1;
}

/**
 * Convert 0-based column index to letters (A, B, ..., Z, AA, AB...).
 */
export function columnIndexToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode(65 + (c % 26)) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

/**
 * Convert row/col (0-based) to A1 notation.
 */
export function cellRefToString(row: number, col: number): string {
  return `${columnIndexToLetter(col)}${row + 1}`;
}