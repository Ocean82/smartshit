import { describe, it, expect } from 'vitest'
import { DEFAULT_CELL_WIDTH } from '@/lib/layoutConstants'
import {
  MIN_COL_WIDTH,
  MAX_COL_WIDTH,
  getColWidth,
  clampColWidth,
  setColAt,
} from './colLayout'
import { shiftSparseMapOnInsert, shiftSparseMapOnDelete } from './rowLayout'

describe('getColWidth', () => {
  it('falls back to default', () => {
    expect(getColWidth({}, 0)).toBe(DEFAULT_CELL_WIDTH)
  })

  it('returns positive overrides', () => {
    expect(getColWidth({ 2: 160 }, 2)).toBe(160)
  })
})

describe('clampColWidth', () => {
  it('clamps and rounds', () => {
    expect(clampColWidth(5)).toBe(MIN_COL_WIDTH)
    expect(clampColWidth(99999)).toBe(MAX_COL_WIDTH)
    expect(clampColWidth(88.6)).toBe(89)
    expect(clampColWidth(Number.NaN)).toBe(DEFAULT_CELL_WIDTH)
  })
})

describe('setColAt', () => {
  it('sets without mutating', () => {
    const base = { 1: 120 }
    expect(setColAt(base, 3, 56.4)).toEqual({ 1: 120, 3: 56 })
    expect(base).toEqual({ 1: 120 })
  })
})

describe('shiftSparseMap for columnWidths', () => {
  it('shifts on insert/delete', () => {
    expect(shiftSparseMapOnInsert({ 1: 120, 3: 200 }, 1)).toEqual({ 1: 120, 4: 200 })
    expect(shiftSparseMapOnDelete({ 1: 120, 3: 200 }, 1)).toEqual({ 2: 200 })
  })
})
