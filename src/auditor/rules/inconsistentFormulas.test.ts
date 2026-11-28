import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

const RULE = 'inconsistent-formulas'

describe('inconsistent-formulas rule', () => {
  it('flags the one cell that breaks a filled-down pattern', () => {
    const cells = { ...fill('A', 2, 9, (r) => r), ...fill('B', 2, 9, (r) => `=A${r}*2`), B5: { value: null, formula: '=A5*3' } }
    const found = findingsOf(cells, RULE)
    expect(found.map((f) => f.cells[0].cellId)).toEqual(['B5'])
  })

  it('reports a cell once even when it also deviates along its row', () => {
    // =$A$1*2 is the same pattern across a row and down a column, so B5 breaks both.
    const cells: Record<string, { value: number | null; formula?: string }> = { A1: { value: 4 } }
    for (let r = 2; r <= 9; r++) for (const c of 'BCDEF') cells[`${c}${r}`] = { value: null, formula: '=$A$1*2' }
    cells.B5 = { value: null, formula: '=$A$1*3' }
    const found = findingsOf(cells, RULE).filter((f) => f.cells[0].cellId === 'B5')
    expect(found).toHaveLength(1)
  })

  it('does not compare unrelated tables stacked in the same column', () => {
    const cells = {
      ...fill('A', 1, 5, (r) => r),
      ...fill('B', 1, 5, (r) => `=A${r}*2`),
      // two blank rows, then a second table whose column B uses a different formula
      ...fill('A', 9, 13, (r) => r),
      ...fill('B', 9, 13, (r) => `=A${r}+1`),
    }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('still flags a deviation inside one block of a multi-table sheet', () => {
    const cells = {
      ...fill('A', 1, 6, (r) => r),
      ...fill('B', 1, 6, (r) => `=A${r}*2`),
      B3: { value: null, formula: '=A3+1' },
      ...fill('A', 10, 14, (r) => r),
      ...fill('B', 10, 14, (r) => `=A${r}+1`),
    }
    expect(findingsOf(cells, RULE).map((f) => f.cells[0].cellId)).toEqual(['B3'])
  })

  it('catches a total that sums fewer rows than its neighbouring totals', () => {
    // Totals in B12:E12 each sum rows 2-11, except D12, which stops at row 10.
    const cells: Record<string, { value: number | null; formula?: string }> = {}
    for (const c of 'BCDE') {
      for (let r = 2; r <= 11; r++) cells[`${c}${r}`] = { value: r }
      cells[`${c}12`] = { value: null, formula: `=SUM(${c}2:${c}${c === 'D' ? 10 : 11})` }
    }
    expect(findingsOf(cells, RULE).map((f) => f.cells[0].cellId)).toEqual(['D12'])
  })

  it('ignores a total row that aggregates the column', () => {
    const cells = { ...fill('A', 1, 5, (r) => r), ...fill('B', 1, 5, (r) => `=A${r}*2`), B6: { value: null, formula: '=SUM(B1:B5)' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })
})
