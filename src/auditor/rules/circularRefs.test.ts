import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

describe('circular-refs rule', () => {
  const RULE = 'circular-refs'

  it('detects a cell that refers to itself', () => {
    const [f] = findingsOf({ A1: { value: null, formula: '=A1+1' } }, RULE)
    expect(f.severity).toBe('critical')
    expect(f.cells.map((c) => c.cellId)).toEqual(['A1'])
  })

  it('detects a three-cell loop once', () => {
    const cells = {
      A1: { value: null, formula: '=B1' },
      B1: { value: null, formula: '=C1' },
      C1: { value: null, formula: '=A1' },
    }
    const found = findingsOf(cells, RULE)
    expect(found).toHaveLength(1)
    expect(found[0].cells.map((c) => c.cellId).sort()).toEqual(['A1', 'B1', 'C1'])
  })

  it('detects a loop closed through a range', () => {
    const cells = { A1: { value: 1 }, B1: { value: null, formula: '=SUM(A1:C1)' }, C1: { value: null, formula: '=B1*2' } }
    expect(findingsOf(cells, RULE)).toHaveLength(1)
  })

  it('accepts a long fill-down chain without a loop', () => {
    const cells = { A1: { value: 1 }, ...fill('A', 2, 3000, (r) => `=A${r - 1}+1`) }
    expect(findingsOf(cells, RULE)).toEqual([])
  })
})
