/**
 * Tests for the pure row-layout helper used by the grid's virtualizer.
 *
 * Row heights come from `sheet.rowHeights` (a sparse map of pixel overrides,
 * e.g. from imported .xlsx files). When a row has no override it falls back to
 * the default height. All offset math must be a pure, testable function so the
 * virtualizer, selection overlay, and scroll-to-cell use one source of truth.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ROW_HEIGHT,
  getRowHeight,
  rowHeightsArray,
  rowCumulativeOffsets,
  rowIndexAtY,
} from './rowLayout'

describe('getRowHeight', () => {
  it('falls back to the default height for rows without an override', () => {
    expect(getRowHeight({}, 0)).toBe(DEFAULT_ROW_HEIGHT)
    expect(getRowHeight({ 5: 40 }, 3)).toBe(DEFAULT_ROW_HEIGHT)
  })

  it('returns the explicit override for a configured row', () => {
    expect(getRowHeight({ 5: 40 }, 5)).toBe(40)
  })

  it('ignores non-positive overrides and uses the default', () => {
    expect(getRowHeight({ 2: 0 }, 2)).toBe(DEFAULT_ROW_HEIGHT)
    expect(getRowHeight({ 2: -10 }, 2)).toBe(DEFAULT_ROW_HEIGHT)
  })
})

describe('rowHeightsArray', () => {
  it('builds a height per row, applying overrides', () => {
    expect(rowHeightsArray({ 1: 40, 3: 56 }, 5)).toEqual([28, 40, 28, 56, 28])
  })

  it('returns all defaults when no overrides exist', () => {
    expect(rowHeightsArray({}, 3)).toEqual([28, 28, 28])
  })
})

describe('rowCumulativeOffsets', () => {
  it('computes the top offset of each row plus the total height', () => {
    // heights:         [28,   40,   28,   56]
    // offsets[i] = top of row i; offsets[4] = total
    expect(rowCumulativeOffsets([28, 40, 28, 56])).toEqual([0, 28, 68, 96, 152])
  })

  it('handles an empty list', () => {
    expect(rowCumulativeOffsets([])).toEqual([0])
  })
})

describe('rowIndexAtY', () => {
  it('maps a pixel offset to its containing row', () => {
    const offsets = rowCumulativeOffsets([28, 40, 28, 56]) // [0,28,68,96,152]
    expect(rowIndexAtY(offsets, 0)).toBe(0)
    expect(rowIndexAtY(offsets, 27)).toBe(0)
    expect(rowIndexAtY(offsets, 28)).toBe(1)
    expect(rowIndexAtY(offsets, 95)).toBe(2)
    expect(rowIndexAtY(offsets, 96)).toBe(3)
    expect(rowIndexAtY(offsets, 151)).toBe(3)
  })

  it('clamps to the last row for offsets beyond the total height', () => {
    const offsets = rowCumulativeOffsets([28, 40, 28, 56])
    expect(rowIndexAtY(offsets, 500)).toBe(3)
  })
})
