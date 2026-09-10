import { describe, expect, it } from 'vitest'
import {
  clampFreezeCount,
  computeFreezeBodyWindow,
  frozenColStickyLeft,
  frozenRowStickyTop,
  stickyPaneBackground,
  splitRectAcrossFreeze,
} from './gridFreeze'

describe('clampFreezeCount', () => {
  it('treats null/negative as 0', () => {
    expect(clampFreezeCount(null, 10)).toBe(0)
    expect(clampFreezeCount(-1, 10)).toBe(0)
  })

  it('caps at max', () => {
    expect(clampFreezeCount(99, 5)).toBe(5)
  })
})

describe('computeFreezeBodyWindow', () => {
  it('keeps body start at/after the freeze line', () => {
    const w = computeFreezeBodyWindow({
      frozenRows: 2,
      frozenCols: 1,
      naturalStartRow: 0,
      naturalEndRow: 20,
      naturalStartCol: 0,
      naturalEndCol: 10,
      displayRowCount: 100,
      totalCols: 26,
    })
    expect(w.frozenRows).toBe(2)
    expect(w.frozenCols).toBe(1)
    expect(w.bodyStartRow).toBe(2)
    expect(w.bodyStartCol).toBe(1)
    expect(w.bodyEndRow).toBe(20)
    expect(w.bodyEndCol).toBe(10)
  })

  it('does not pull body start below natural scroll when past freeze', () => {
    const w = computeFreezeBodyWindow({
      frozenRows: 2,
      frozenCols: 1,
      naturalStartRow: 40,
      naturalEndRow: 60,
      naturalStartCol: 8,
      naturalEndCol: 15,
      displayRowCount: 100,
      totalCols: 26,
    })
    expect(w.bodyStartRow).toBe(40)
    expect(w.bodyStartCol).toBe(8)
  })

  it('handles zero freeze as a normal window', () => {
    const w = computeFreezeBodyWindow({
      frozenRows: 0,
      frozenCols: 0,
      naturalStartRow: 5,
      naturalEndRow: 15,
      naturalStartCol: 2,
      naturalEndCol: 9,
      displayRowCount: 100,
      totalCols: 26,
    })
    expect(w.bodyStartRow).toBe(5)
    expect(w.bodyStartCol).toBe(2)
  })
})

describe('sticky offsets', () => {
  it('stacks frozen row tops under the column header', () => {
    expect(frozenRowStickyTop(26, [0, 28, 56, 84], 0)).toBe(26)
    expect(frozenRowStickyTop(26, [0, 28, 56, 84], 1)).toBe(54)
  })

  it('stacks frozen col lefts after the row header', () => {
    const widths = [100, 80, 60]
    expect(frozenColStickyLeft(46, (c) => widths[c], 0)).toBe(46)
    expect(frozenColStickyLeft(46, (c) => widths[c], 2)).toBe(46 + 100 + 80)
  })
})

describe('stickyPaneBackground', () => {
  it('keeps explicit cell fill', () => {
    expect(stickyPaneBackground('#ff0000')).toBe('#ff0000')
  })

  it('falls back to white when empty', () => {
    expect(stickyPaneBackground(undefined)).toBe('#fff')
    expect(stickyPaneBackground('')).toBe('#fff')
    expect(stickyPaneBackground('   ')).toBe('#fff')
  })
})

describe('splitRectAcrossFreeze', () => {
  it('returns only body when rect is fully past freeze', () => {
    const { frozen, body } = splitRectAcrossFreeze(
      { top: 80, left: 120, width: 50, height: 40 },
      { topInset: 56, leftInset: 100 },
    )
    expect(frozen).toEqual([])
    expect(body).toEqual({ top: 80, left: 120, width: 50, height: 40 })
  })

  it('returns only frozen when rect is inside the freeze corner', () => {
    const { frozen, body } = splitRectAcrossFreeze(
      { top: 0, left: 0, width: 50, height: 40 },
      { topInset: 56, leftInset: 100 },
    )
    expect(body).toBeNull()
    expect(frozen).toEqual([{ top: 0, left: 0, width: 50, height: 40 }])
  })

  it('splits a straddling rect into non-overlapping frozen + body', () => {
    const { frozen, body } = splitRectAcrossFreeze(
      { top: 20, left: 40, width: 120, height: 80 },
      { topInset: 56, leftInset: 100 },
    )
    expect(frozen).toEqual([
      { top: 20, left: 40, width: 120, height: 36 },
      { top: 56, left: 40, width: 60, height: 44 },
    ])
    expect(body).toEqual({ top: 56, left: 100, width: 60, height: 44 })
  })
})
