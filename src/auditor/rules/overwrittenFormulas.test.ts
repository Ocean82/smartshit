import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

const RULE = 'overwritten-formula'

describe('overwritten-formula rule', () => {
  it('flags a typed number in the middle of a filled-down formula column', () => {
    const cells = { ...fill('A', 2, 9, (r) => r), ...fill('B', 2, 9, (r) => `=A${r}*2`), B5: { value: 999 } }
    const found = findingsOf(cells, RULE)
    expect(found.map((f) => f.cells[0].cellId)).toEqual(['B5'])
    expect(found[0].severity).toBe('high')
    expect(found[0].message).toContain('999')
  })

  it('flags a typed number inside a filled-right formula row', () => {
    const cells: Record<string, { value: number | null; formula?: string }> = { A1: { value: 1 } }
    for (const c of 'BCDEFG') cells[`${c}1`] = { value: null, formula: '=$A$1*2' }
    cells.D1 = { value: 7 }
    expect(findingsOf(cells, RULE).map((f) => f.cells[0].cellId)).toEqual(['D1'])
  })

  it('ignores inputs above or below the formula run', () => {
    const cells = { ...fill('B', 3, 8, (r) => `=A${r}*2`), B1: { value: 10 }, B10: { value: 5 } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('ignores a column that is mostly typed numbers', () => {
    const cells = { ...fill('B', 1, 9, (r) => r), B3: { value: null, formula: '=A3' }, B5: { value: null, formula: '=A5' }, B7: { value: null, formula: '=A7' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('ignores a column whose formulas follow no common pattern', () => {
    const cells = {
      B1: { value: null, formula: '=A1*2' }, B2: { value: null, formula: '=A2+1' },
      B3: { value: 4 }, B4: { value: null, formula: '=SUM(A1:A3)' }, B5: { value: null, formula: '=A5/2' },
    }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('does not treat a separate table below as part of the run', () => {
    const cells = { ...fill('B', 1, 5, (r) => `=A${r}*2`), ...fill('B', 9, 12, (r) => r) }
    expect(findingsOf(cells, RULE)).toEqual([])
  })
})
