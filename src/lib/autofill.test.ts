import { describe, expect, it } from 'vitest'
import type { CellData } from '@/types'
import { adjustFormulaRefs, buildFillPattern, fillCellAt, pointToCell } from './autofill'

const num = (v: number, extra?: Partial<CellData>): CellData => ({ value: v, ...extra })
const str = (v: string): CellData => ({ value: v })

describe('buildFillPattern', () => {
  it('blank strip → blank pattern', () => {
    expect(buildFillPattern([])).toEqual({ kind: 'blank' })
  })

  it('single number → copy (linear step 0)', () => {
    expect(buildFillPattern([num(5)])).toEqual({ kind: 'linear', start: 5, step: 0, len: 1 })
  })

  it('constant-step numbers → linear series', () => {
    expect(buildFillPattern([num(1), num(3)])).toMatchObject({ kind: 'linear', start: 1, step: 2 })
  })

  it('non-constant numbers → repeat', () => {
    expect(buildFillPattern([num(1), num(2), num(4)]).kind).toBe('repeat')
  })

  it('single date-formatted number → date incremented by 1', () => {
    const p = buildFillPattern([num(45658, { format: { numberFormat: 'date' } })])
    expect(p).toMatchObject({ kind: 'date', start: 45658, step: 1 })
  })

  it('constant-step date serials → date series by that step', () => {
    const mk = (v: number) => num(v, { format: { numberFormat: 'date' } })
    expect(buildFillPattern([mk(45658), mk(45660)])).toMatchObject({ kind: 'date', start: 45658, step: 2 })
  })

  it('single text-with-trailing-number → textNumber step 1', () => {
    expect(buildFillPattern([str('Item 1')])).toMatchObject({ kind: 'textNumber', prefix: 'Item ', suffix: '', startNum: 1, step: 1 })
  })

  it('two text-with-number cells → step = difference', () => {
    expect(buildFillPattern([str('Row 1'), str('Row 4')])).toMatchObject({ kind: 'textNumber', prefix: 'Row ', suffix: '', startNum: 1, step: 3 })
  })

  it('plain text without number → repeat', () => {
    expect(buildFillPattern([str('hello')]).kind).toBe('repeat')
  })

  it('copies hyperlink on repeat fill', () => {
    const link = { url: 'https://example.com/' }
    const p = buildFillPattern([{ value: 'Click', hyperlink: link }])
    expect(p.kind).toBe('repeat')
    expect(fillCellAt(p, 1)?.hyperlink).toEqual(link)
  })

  it('boolean cell → repeat', () => {
    expect(buildFillPattern([{ value: true }, { value: false }]).kind).toBe('repeat')
  })

  it('any formula → repeat', () => {
    expect(buildFillPattern([num(1), { value: 3, formula: '=A1' }]).kind).toBe('repeat')
  })
})

describe('fillCellAt', () => {
  it('linear: value = start + step*k', () => {
    const pattern = buildFillPattern([num(1), num(3)])
    expect(fillCellAt(pattern, 1)?.value).toBe(5)
    expect(fillCellAt(pattern, 2)?.value).toBe(7)
  })

  it('repeat: wraps modulo the strip, preserving formulas and format', () => {
    const strip = [num(1, { format: { bold: true } }), { value: 2, formula: '=B1' }]
    const pattern = buildFillPattern(strip)
    expect(fillCellAt(pattern, 1)).toMatchObject({ value: 1, format: { bold: true }, sourceStripIndex: 0 })
    expect(fillCellAt(pattern, 2)).toMatchObject({ value: 2, formula: '=B1', sourceStripIndex: 1 })
    expect(fillCellAt(pattern, 3)?.value).toBe(1)
  })

  it('blank → null', () => {
    expect(fillCellAt({ kind: 'blank' }, 1)).toBeNull()
  })

  it('textNumber: prefix/num/suffix with step', () => {
    const pattern = buildFillPattern([str('Item 2')])
    expect(fillCellAt(pattern, 1)?.value).toBe('Item 3')
    expect(fillCellAt(pattern, 2)?.value).toBe('Item 4')
  })
})

describe('adjustFormulaRefs', () => {
  it('shifts relative row and column refs', () => {
    expect(adjustFormulaRefs('=A1+B2', 1, 1)).toBe('=B2+C3')
  })

  it('shifts both range endpoints', () => {
    expect(adjustFormulaRefs('=SUM(A1:B2)', 2, 0)).toBe('=SUM(A3:B4)')
  })

  it('keeps absolute refs ($A$1) untouched', () => {
    expect(adjustFormulaRefs('=SUM($A$1:B2)', 2, 0)).toBe('=SUM($A$1:B4)')
  })

  it('honors partial absolutes: $A1 shifts rows, A$1 shifts cols', () => {
    expect(adjustFormulaRefs('=$A1', 1, 0)).toBe('=$A2')
    expect(adjustFormulaRefs('=A$1', 0, 1)).toBe('=B$1')
  })

  it('left/up deltas can be negative', () => {
    expect(adjustFormulaRefs('=B2', -1, -1)).toBe('=A1')
  })

  it('leaves function names and numbers alone', () => {
    expect(adjustFormulaRefs('=SUM(1,2)', 1, 1)).toBe('=SUM(1,2)')
  })

  it('handles multiple column letters (AA1)', () => {
    expect(adjustFormulaRefs('=AA1', 0, 1)).toBe('=AB1')
  })
})

describe('pointToCell', () => {
  const ref = {
    gridLeft: 100,
    gridTop: 50,
    scrollLeft: 20,
    scrollTop: 10,
    rowHeaderWidth: 46,
    colHeaderHeight: 26,
    rowOffsets: [0, 28, 56, 84, 112],
    colOffsets: [0, 100, 200, 300],
    totalRows: 4,
    totalCols: 3,
  }

  it('maps viewport client coords to a cell', () => {
    expect(pointToCell(100 + 46 + 20, 50 + 26 + 10, ref)).toEqual({ row: 0, col: 0 })
    expect(pointToCell(100 + 46 + 20 + 150, 50 + 26 + 10 + 50, ref)).toEqual({ row: 2, col: 1 })
  })

  it('clamps above/left of the grid to origin', () => {
    expect(pointToCell(100, 50, ref)).toEqual({ row: 0, col: 0 })
  })

  it('clamps beyond the last row/col', () => {
    expect(pointToCell(100 + 46 + 20 + 999, 50 + 26 + 10 + 999, ref)).toEqual({ row: 3, col: 2 })
  })
})