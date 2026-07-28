/**
 * Tests for computePivotTable — the standalone pivot aggregation function.
 *
 * Covers:
 *  - All six aggregation modes (sum, count, average, min, max, distinctCount)
 *  - Header-row skip when hasHeader=true (bug B6 regression)
 *  - hasHeader=false — every row is treated as data
 *  - Non-numeric cells are excluded from numeric aggregations
 *  - Multi-column cross-tabulation (pivot columns)
 *  - Result always has { headers, rows, grandTotals } shape
 */

import { describe, it, expect } from 'vitest';
import { computePivotTable } from './pivot';
import type { PivotConfig } from '@/types';
import { refToCell } from './spreadsheet';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a flat cell record from a 2D value array.
 * Row 0 / Col 0 are 0-based.
 */
function makeCells(
  data: (string | number | boolean | null)[][],
): Record<string, { value: string | number | boolean | null }> {
  const cells: Record<string, { value: string | number | boolean | null }> = {};
  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < data[r].length; c++) {
      cells[refToCell(r, c)] = { value: data[r][c] };
    }
  }
  return cells;
}

/** Minimal valid PivotConfig with sensible defaults. */
function pivotConfig(overrides: Partial<PivotConfig> = {}): PivotConfig {
  return {
    sourceSheetId: 's1',
    sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
    rows: [],
    columns: [],
    values: [],
    hasHeader: false,
    ...overrides,
  };
}

// ─── Aggregation modes ────────────────────────────────────────────────────────

describe('computePivotTable — aggregation modes', () => {
  /**
   * Dataset (0-based, no header):
   *   Row 0: Category=A, Amount=10
   *   Row 1: Category=A, Amount=20
   *   Row 2: Category=B, Amount=5
   */
  const cells = makeCells([
    ['A', 10],
    ['A', 20],
    ['B',  5],
  ]);

  const baseConfig = pivotConfig({
    sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
    rows: [{ sourceColumn: 'A', aggregation: 'sum' }],
    columns: [],
    values: [{ sourceColumn: 'B', aggregation: 'sum' }],
    hasHeader: false,
  });

  it('sum — adds numeric values per group', () => {
    const result = computePivotTable(cells, baseConfig, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    const rowB = result.rows.find((r) => r[0] === 'B');
    expect(rowA?.[1]).toBe(30); // 10 + 20
    expect(rowB?.[1]).toBe(5);
  });

  it('count — counts how many numeric values exist per group', () => {
    const config = { ...baseConfig, values: [{ sourceColumn: 'B', aggregation: 'count' as const }] };
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    expect(rowA?.[1]).toBe(2);
  });

  it('average — computes mean per group', () => {
    const config = { ...baseConfig, values: [{ sourceColumn: 'B', aggregation: 'average' as const }] };
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    expect(rowA?.[1]).toBe(15); // (10 + 20) / 2
  });

  it('min — returns smallest value per group', () => {
    const config = { ...baseConfig, values: [{ sourceColumn: 'B', aggregation: 'min' as const }] };
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    expect(rowA?.[1]).toBe(10);
  });

  it('max — returns largest value per group', () => {
    const config = { ...baseConfig, values: [{ sourceColumn: 'B', aggregation: 'max' as const }] };
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    expect(rowA?.[1]).toBe(20);
  });

  it('distinctCount — counts unique numeric values per group', () => {
    const dupCells = makeCells([
      ['A', 10],
      ['A', 10], // duplicate value
      ['A', 20],
    ]);
    const config = { ...baseConfig, values: [{ sourceColumn: 'B', aggregation: 'distinctCount' as const }] };
    const result = computePivotTable(dupCells, config, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    expect(rowA?.[1]).toBe(2); // 10 and 20 are the two distinct values
  });
});

// ─── Header-row skip (B6 regression) ──────────────────────────────────────────

describe('computePivotTable — header-row handling (B6 regression)', () => {
  /**
   * Selection includes header row (row 0). PivotDialog pre-adjusts startRow
   * for the engine call, but `computePivotTable` must *also* respect
   * `config.hasHeader` via `dataStartRow`.
   *
   * If the bug is present, the header strings "Category" / "Amount" are
   * included in the aggregation — "Amount" parses as NaN, silently under-
   * counting the total and treating "Category" as an extra group key.
   */
  const cells = makeCells([
    ['Category', 'Amount'], // row 0 — header; must be excluded
    ['Food',       100],
    ['Food',        50],
  ]);

  it('skips the header row and does not count header strings as data (hasHeader=true)', () => {
    const config = pivotConfig({
      sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
      rows: [{ sourceColumn: 'A', aggregation: 'sum' }],
      columns: [],
      values: [{ sourceColumn: 'B', aggregation: 'sum' }],
      hasHeader: true,
    });
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    const food = result.rows.find((r) => r[0] === 'Food');

    // Sum must be 150, not 100 (which would happen if header NaN were dropped
    // and only one data row were counted), and not NaN.
    expect(food?.[1]).toBe(150);

    // The header row must never appear as a row key
    expect(result.rows.every((r) => r[0] !== 'Category')).toBe(true);
  });

  it('includes every row when hasHeader=false', () => {
    const config = pivotConfig({
      sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
      rows: [{ sourceColumn: 'A', aggregation: 'sum' }],
      columns: [],
      values: [{ sourceColumn: 'B', aggregation: 'count' }],
      hasHeader: false,
    });
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    // All three rows are treated as data, so "Category" appears as a group key
    expect(result.rows.some((r) => r[0] === 'Category')).toBe(true);
    // "Food" appears twice → count of 2 (for numeric "Amount" values)
    const food = result.rows.find((r) => r[0] === 'Food');
    expect(food?.[1]).toBe(2);
  });
});

// ─── Non-numeric value filtering ─────────────────────────────────────────────

describe('computePivotTable — non-numeric value filtering', () => {
  it('ignores null and string cells in numeric aggregations without crashing', () => {
    const cells = makeCells([
      ['A',  10],
      ['A',  null],  // null — must be skipped
      ['A', 'n/a'], // non-numeric string — must be skipped
    ]);
    const config = pivotConfig({
      sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
      rows: [{ sourceColumn: 'A', aggregation: 'sum' }],
      columns: [],
      values: [{ sourceColumn: 'B', aggregation: 'sum' }],
      hasHeader: false,
    });
    const result = computePivotTable(cells, config, 0, 2, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    // Only the numeric 10 contributes; null and 'n/a' are filtered out
    expect(rowA?.[1]).toBe(10);
  });

  it('returns 0 for count when no numeric values exist in a group', () => {
    const cells = makeCells([
      ['A', null],
      ['A', 'text'],
    ]);
    const config = pivotConfig({
      sourceRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      rows: [{ sourceColumn: 'A', aggregation: 'sum' }],
      columns: [],
      values: [{ sourceColumn: 'B', aggregation: 'count' }],
      hasHeader: false,
    });
    const result = computePivotTable(cells, config, 0, 1, 0, 1);
    const rowA = result.rows.find((r) => r[0] === 'A');
    expect(rowA?.[1]).toBe(0);
  });
});

// ─── Cross-tabulation (column pivot) ──────────────────────────────────────────

describe('computePivotTable — cross-tabulation', () => {
  /**
   * Region × Product sales:
   *   North, Widget, 100
   *   North, Gadget, 200
   *   South, Widget,  50
   */
  const cells = makeCells([
    ['North', 'Widget', 100],
    ['North', 'Gadget', 200],
    ['South', 'Widget',  50],
  ]);

  it('produces one result column per unique column-field value', () => {
    const config: PivotConfig = {
      sourceSheetId: 's1',
      sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 2 },
      rows:    [{ sourceColumn: 'A', aggregation: 'sum' }],
      columns: [{ sourceColumn: 'B', aggregation: 'sum' }],
      values:  [{ sourceColumn: 'C', aggregation: 'sum' }],
      hasHeader: false,
    };
    const result = computePivotTable(cells, config, 0, 2, 0, 2);

    // At least two column groups: Widget and Gadget
    expect(result.headers.length).toBeGreaterThan(2);

    const northRow = result.rows.find((r) => r[0] === 'North');
    expect(northRow).toBeDefined();

    // North should contain 100 (Widget) and 200 (Gadget) somewhere in its values
    const northValues = northRow!.slice(1).filter((v) => typeof v === 'number');
    expect(northValues).toContain(100);
    expect(northValues).toContain(200);

    // South should have 50 for Widget and 0 for Gadget (no matching rows)
    const southRow = result.rows.find((r) => r[0] === 'South');
    expect(southRow).toBeDefined();
    const southValues = southRow!.slice(1).filter((v) => typeof v === 'number');
    expect(southValues).toContain(50);
  });
});

// ─── Returned shape ───────────────────────────────────────────────────────────

describe('computePivotTable — returned shape', () => {
  it('always returns { headers: string[], rows: array, grandTotals: array }', () => {
    const result = computePivotTable(
      {},
      pivotConfig({ rows: [], columns: [], values: [] }),
      0, 0, 0, 0,
    );
    expect(Array.isArray(result.headers)).toBe(true);
    expect(Array.isArray(result.rows)).toBe(true);
    expect(Array.isArray(result.grandTotals)).toBe(true);
  });

  it('returns empty rows when the source range is empty', () => {
    const result = computePivotTable(
      {},
      pivotConfig({
        sourceRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
        rows: [{ sourceColumn: 'A', aggregation: 'sum' }],
        columns: [],
        values: [{ sourceColumn: 'B', aggregation: 'sum' }],
        hasHeader: true, // only row is the header — no data rows
      }),
      0, 0, 0, 1,
    );
    expect(result.rows).toHaveLength(0);
  });
});

// ─── Multi-field row grouping ─────────────────────────────────────────────────

describe('computePivotTable — multi-field row grouping', () => {
  it('groups by two row fields producing composite keys', () => {
    const cells = makeCells([
      ['North', 'Q1', 100],
      ['North', 'Q2', 200],
      ['South', 'Q1',  50],
    ]);
    const config: PivotConfig = {
      sourceSheetId: 's1',
      sourceRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 2 },
      rows: [
        { sourceColumn: 'A', aggregation: 'sum' },
        { sourceColumn: 'B', aggregation: 'sum' },
      ],
      columns: [],
      values: [{ sourceColumn: 'C', aggregation: 'sum' }],
      hasHeader: false,
    };
    const result = computePivotTable(cells, config, 0, 2, 0, 2);
    // Three distinct (Region, Quarter) combinations → three rows
    expect(result.rows).toHaveLength(3);
    const northQ1 = result.rows.find((r) => r[0] === 'North' && r[1] === 'Q1');
    expect(northQ1?.[2]).toBe(100);
  });
});
