import { describe, expect, it } from 'vitest'
import {
  parseMergeRange,
  toMergeRange,
  normalizeMergeRange,
  rangesOverlap,
  buildMergeIndex,
  getMergeAt,
  isMergeAnchor,
  shiftMergesOnInsert,
  shiftMergesOnDelete,
  type MergeRange,
} from './merge'

describe('parseMergeRange', () => {
  it('parses a two-cell range ref', () => {
    expect(parseMergeRange('A1:B3')).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 1 })
  })

  it('parses a bare anchor ref as a 1x1 range', () => {
    expect(parseMergeRange('B3')).toEqual({ startRow: 2, startCol: 1, endRow: 2, endCol: 1 })
  })

  it('is case-insensitive', () => {
    expect(parseMergeRange('b3:d5')).toEqual({ startRow: 2, startCol: 1, endRow: 4, endCol: 3 })
  })

  it('returns null for malformed refs', () => {
    expect(parseMergeRange('')).toBeNull()
    expect(parseMergeRange('A')).toBeNull()
    expect(parseMergeRange('1')).toBeNull()
    expect(parseMergeRange('A1:')).toBeNull()
    expect(parseMergeRange(':B3')).toBeNull()
    expect(parseMergeRange('A1:B3:C4')).toBeNull()
    expect(parseMergeRange('A0')).toBeNull()
    expect(parseMergeRange('AA0')).toBeNull()
  })
})

describe('toMergeRange / normalizeMergeRange', () => {
  it('emits a canonical range ref', () => {
    expect(toMergeRange(0, 0, 2, 1)).toBe('A1:B3')
  })

  it('keeps the 1x1 form explicit', () => {
    expect(toMergeRange(2, 1, 2, 1)).toBe('B3:B3')
  })

  it('normalizes both forms and rejects malformed input', () => {
    expect(normalizeMergeRange('A1:B3')).toBe('A1:B3')
    expect(normalizeMergeRange('B3')).toBe('B3:B3')
    expect(normalizeMergeRange('c5')).toBe('C5:C5')
    expect(normalizeMergeRange('zzz')).toBeNull()
  })
})

describe('rangesOverlap', () => {
  const overlap: MergeRange = { startRow: 0, startCol: 0, endRow: 2, endCol: 1 }
  const inside: MergeRange = { startRow: 1, startCol: 0, endRow: 1, endCol: 1 }
  const outside: MergeRange = { startRow: 3, startCol: 3, endRow: 4, endCol: 4 }
  const touching: MergeRange = { startRow: 3, startCol: 0, endRow: 4, endCol: 1 }

  it('detects containment and intersection', () => {
    expect(rangesOverlap(overlap, inside)).toBe(true)
    expect(rangesOverlap(inside, overlap)).toBe(true)
  })

  it('rejects disjoint ranges', () => {
    expect(rangesOverlap(overlap, outside)).toBe(false)
  })

  it('rejects edge-touching ranges', () => {
    expect(rangesOverlap(overlap, touching)).toBe(false)
  })
})

describe('buildMergeIndex / getMergeAt / isMergeAnchor', () => {
  it('maps every covered cell to its range and the anchor to the range key', () => {
    const index = buildMergeIndex(['A1:B2'])
    expect(getMergeAt(index, 0, 0)).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(getMergeAt(index, 0, 1)).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(getMergeAt(index, 1, 0)).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(getMergeAt(index, 1, 1)).toEqual({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })
    expect(getMergeAt(index, 2, 0)).toBeNull()
    expect(isMergeAnchor(index, 0, 0)).toBe(true)
    expect(isMergeAnchor(index, 0, 1)).toBe(false)
    expect(isMergeAnchor(index, 1, 1)).toBe(false)
  })

  it('handles bare anchors and overlapped ranges deterministically (first wins)', () => {
    const index = buildMergeIndex(['A1', 'A1:B1'])
    expect(getMergeAt(index, 0, 0)).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    expect(getMergeAt(index, 0, 1)).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
  })

  it('returns an empty index for no merges', () => {
    const index = buildMergeIndex(undefined)
    expect(index.byCell.size).toBe(0)
    expect(getMergeAt(index, 0, 0)).toBeNull()
  })

  it('skips malformed entries', () => {
    const index = buildMergeIndex(['A1:B2', 'not-a-ref', ''])
    expect(index.byCell.size).toBe(4)
  })
})

describe('shiftMergesOnInsert / shiftMergesOnDelete', () => {
  it('shifts entirely-after merges and expands straddling ones on insert', () => {
    expect(shiftMergesOnInsert(['A1:B2', 'D5:E6'], 'row', 0)).toEqual(['A1:B3', 'D6:E7'])
    expect(shiftMergesOnInsert(['A1:B2', 'D5:E6'], 'col', 0)).toEqual(['A1:C2', 'E5:F6'])
  })

  it('leaves merges that end at the insert point alone', () => {
    expect(shiftMergesOnInsert(['A1:B2'], 'row', 1)).toEqual(['A1:B2'])
  })

  it('shrinks / shifts / drops on delete', () => {
    expect(shiftMergesOnDelete(['A1:B2', 'D5:E6'], 'row', 1)).toEqual(['A1:B1', 'D4:E5'])
    expect(shiftMergesOnDelete(['A1:A2', 'C1:D1'], 'col', 0)).toEqual(['B1:C1'])
    expect(shiftMergesOnDelete(['A1:A1'], 'row', 0)).toBeUndefined()
  })
})
