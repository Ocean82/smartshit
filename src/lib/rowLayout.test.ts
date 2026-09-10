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
  MIN_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  clampRowHeight,
  setRowAt,
  shiftRowHeightsOnInsert,
  shiftRowHeightsOnDelete,
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

describe('clampRowHeight', () => {
  it('clamps below the minimum', () => {
    expect(clampRowHeight(5)).toBe(MIN_ROW_HEIGHT)
  })

  it('clamps above the maximum', () => {
    expect(clampRowHeight(99999)).toBe(MAX_ROW_HEIGHT)
  })

  it('rounds fractional heights', () => {
    expect(clampRowHeight(33.6)).toBe(34)
  })

  it('returns DEFAULT_ROW_HEIGHT for non-finite input', () => {
    expect(clampRowHeight(Number.NaN)).toBe(DEFAULT_ROW_HEIGHT)
    expect(clampRowHeight(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ROW_HEIGHT)
  })

  it('passes in-range values through unchanged', () => {
    expect(clampRowHeight(64)).toBe(64)
  })
})

describe('setRowAt', () => {
  it('sets a clamped height for the row without mutating the input', () => {
    const base = { 1: 40 }
    const next = setRowAt(base, 3, 56.4)
    expect(next).toEqual({ 1: 40, 3: 56 })
    expect(base).toEqual({ 1: 40 })
  })

  it('clamps out-of-range heights to the bounds', () => {
    expect(setRowAt({}, 0, -5)).toEqual({ 0: MIN_ROW_HEIGHT })
    expect(setRowAt({}, 0, 5000)).toEqual({ 0: MAX_ROW_HEIGHT })
  })
})

describe('shiftRowHeightsOnInsert', () => {
  it('shifts overrides below the insert point down by one', () => {
    const base = { 1: 40, 3: 56 }
    const next = shiftRowHeightsOnInsert(base, 1)
    expect(next).toEqual({ 1: 40, 4: 56 })
    expect(base).toEqual({ 1: 40, 3: 56 })
  })

  it('leaves overrides at or above the insert point in place', () => {
    expect(shiftRowHeightsOnInsert({ 0: 44, 2: 50 }, 2)).toEqual({ 0: 44, 2: 50 })
  })
})

describe('shiftRowHeightsOnDelete', () => {
  it('drops the deleted row and shifts later overrides up', () => {
    const base = { 1: 40, 3: 56, 5: 90 }
    const next = shiftRowHeightsOnDelete(base, 3)
    expect(next).toEqual({ 1: 40, 4: 90 })
    expect(base).toEqual({ 1: 40, 3: 56, 5: 90 })
  })

  it('leaves earlier overrides unchanged when deleting a later row', () => {
    expect(shiftRowHeightsOnDelete({ 1: 40, 3: 56 }, 5)).toEqual({ 1: 40, 3: 56 })
  })
})
