import { describe, expect, it } from 'vitest'
import {
  adjacentHiddenBlock,
  buildVisibleColIndices,
  buildVisibleRowIndices,
  isHidden,
  resolveUnhideIndices,
  setHidden,
  shiftHiddenOnDelete,
  shiftHiddenOnInsert,
} from './rowColVisibility'

describe('setHidden / isHidden', () => {
  it('marks and clears indices', () => {
    const hidden = setHidden(undefined, [2, 4], true)
    expect(isHidden(hidden, 2)).toBe(true)
    expect(isHidden(hidden, 3)).toBe(false)
    const cleared = setHidden(hidden, [2], false)
    expect(isHidden(cleared, 2)).toBe(false)
    expect(isHidden(cleared, 4)).toBe(true)
  })
})

describe('adjacentHiddenBlock', () => {
  it('finds contiguous block before/after anchor', () => {
    const map = setHidden(undefined, [1, 2, 3, 7], true)
    expect(adjacentHiddenBlock(map, 4, 'before')).toEqual([1, 2, 3])
    expect(adjacentHiddenBlock(map, 6, 'after')).toEqual([7])
    expect(adjacentHiddenBlock(map, 5, 'before')).toEqual([])
  })
})

describe('buildVisibleRowIndices', () => {
  it('returns null for identity', () => {
    expect(buildVisibleRowIndices(10, null, undefined)).toBeNull()
  })

  it('applies hide on top of filter', () => {
    const hidden = setHidden(undefined, [2], true)
    expect(buildVisibleRowIndices(5, [0, 1, 2, 4], hidden)).toEqual([0, 1, 4])
  })

  it('skips hidden when unfiltered', () => {
    const hidden = setHidden(undefined, [1], true)
    expect(buildVisibleRowIndices(4, null, hidden)).toEqual([0, 2, 3])
  })
})

describe('buildVisibleColIndices', () => {
  it('returns null when nothing hidden', () => {
    expect(buildVisibleColIndices(5, undefined)).toBeNull()
  })

  it('skips hidden cols', () => {
    const hidden = setHidden(undefined, [1, 3], true)
    expect(buildVisibleColIndices(5, hidden)).toEqual([0, 2, 4])
  })
})

describe('shiftHiddenOnInsert/Delete', () => {
  it('shifts maps like row heights', () => {
    const map = setHidden(undefined, [1, 4], true)
    expect(shiftHiddenOnInsert(map, 1)).toEqual({ 1: true, 5: true })
    expect(shiftHiddenOnDelete(map, 1)).toEqual({ 3: true })
  })
})

describe('resolveUnhideIndices', () => {
  it('includes span and adjacent hidden blocks', () => {
    const map = setHidden(undefined, [1, 2, 5, 6], true)
    expect(resolveUnhideIndices(map, 3, 4)).toEqual([1, 2, 5, 6])
    expect(resolveUnhideIndices(map, 5, 5)).toEqual([5, 6])
  })
})
