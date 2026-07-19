import { describe, expect, it } from 'vitest'
import {
  normalizeRange,
  isInRange,
  isInMultiSelection,
  isEntireRow,
  isEntireColumn,
  rangeSize,
  multiSelectionSize,
  rangeToCellIds,
  multiSelectionToCellIds,
  rangesOverlap,
} from './selection'

describe('normalizeRange', () => {
  it('normalizes inverted range', () => {
    expect(normalizeRange({ startRow: 5, startCol: 3, endRow: 2, endCol: 1 }))
      .toEqual({ startRow: 2, startCol: 1, endRow: 5, endCol: 3 })
  })

  it('leaves already-normal range unchanged', () => {
    expect(normalizeRange({ startRow: 0, startCol: 0, endRow: 3, endCol: 5 }))
      .toEqual({ startRow: 0, startCol: 0, endRow: 3, endCol: 5 })
  })
})

describe('isInRange', () => {
  const range = { startRow: 2, startCol: 1, endRow: 5, endCol: 4 }

  it('returns true for cells inside', () => {
    expect(isInRange(3, 2, range)).toBe(true)
    expect(isInRange(2, 1, range)).toBe(true) // corner
    expect(isInRange(5, 4, range)).toBe(true) // corner
  })

  it('returns false for cells outside', () => {
    expect(isInRange(1, 1, range)).toBe(false)
    expect(isInRange(6, 2, range)).toBe(false)
    expect(isInRange(3, 0, range)).toBe(false)
    expect(isInRange(3, 5, range)).toBe(false)
  })
})

describe('isInMultiSelection', () => {
  const state = {
    primary: { startRow: 0, startCol: 0, endRow: 2, endCol: 2 },
    additional: [{ startRow: 5, startCol: 5, endRow: 7, endCol: 7 }],
  }

  it('finds cell in primary', () => {
    expect(isInMultiSelection(1, 1, state)).toBe(true)
  })

  it('finds cell in additional range', () => {
    expect(isInMultiSelection(6, 6, state)).toBe(true)
  })

  it('returns false for gap between ranges', () => {
    expect(isInMultiSelection(3, 3, state)).toBe(false)
  })
})

describe('isEntireRow / isEntireColumn', () => {
  it('detects entire row', () => {
    expect(isEntireRow({ startRow: 2, startCol: 0, endRow: 2, endCol: 25 }, 26)).toBe(true)
    expect(isEntireRow({ startRow: 2, startCol: 1, endRow: 2, endCol: 25 }, 26)).toBe(false)
  })

  it('detects entire column', () => {
    expect(isEntireColumn({ startRow: 0, startCol: 3, endRow: 99, endCol: 3 }, 100)).toBe(true)
    expect(isEntireColumn({ startRow: 1, startCol: 3, endRow: 99, endCol: 3 }, 100)).toBe(false)
  })
})

describe('rangeSize', () => {
  it('calculates correctly', () => {
    expect(rangeSize({ startRow: 0, startCol: 0, endRow: 2, endCol: 3 })).toBe(12) // 3 rows x 4 cols
    expect(rangeSize({ startRow: 5, startCol: 5, endRow: 5, endCol: 5 })).toBe(1) // single cell
  })
})

describe('multiSelectionSize', () => {
  it('sums primary + additional', () => {
    const state = {
      primary: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }, // 4 cells
      additional: [{ startRow: 5, startCol: 5, endRow: 6, endCol: 5 }], // 2 cells
    }
    expect(multiSelectionSize(state)).toBe(6)
  })
})

describe('rangeToCellIds', () => {
  const refToCell = (r: number, c: number) => `${String.fromCharCode(65 + c)}${r + 1}`

  it('enumerates cells', () => {
    const ids = rangeToCellIds({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 }, refToCell)
    expect(ids).toEqual(['A1', 'B1', 'A2', 'B2'])
  })
})

describe('multiSelectionToCellIds', () => {
  const refToCell = (r: number, c: number) => `${String.fromCharCode(65 + c)}${r + 1}`

  it('deduplicates overlapping ranges', () => {
    const state = {
      primary: { startRow: 0, startCol: 0, endRow: 1, endCol: 0 }, // A1, A2
      additional: [{ startRow: 1, startCol: 0, endRow: 2, endCol: 0 }], // A2, A3 (A2 overlaps)
    }
    const ids = multiSelectionToCellIds(state, refToCell)
    expect(ids.sort()).toEqual(['A1', 'A2', 'A3'])
  })
})

describe('rangesOverlap', () => {
  it('detects overlap', () => {
    const a = { startRow: 0, startCol: 0, endRow: 3, endCol: 3 }
    const b = { startRow: 2, startCol: 2, endRow: 5, endCol: 5 }
    expect(rangesOverlap(a, b)).toBe(true)
  })

  it('detects no overlap', () => {
    const a = { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }
    const b = { startRow: 3, startCol: 3, endRow: 5, endCol: 5 }
    expect(rangesOverlap(a, b)).toBe(false)
  })
})
