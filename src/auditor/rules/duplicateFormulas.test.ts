import { describe, expect, it } from 'vitest'
import { findingsOf } from '../__tests__/helpers'

const RULE = 'duplicate-formulas'
const same = (n: number, formula: string) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`B${i + 1}`, { value: null, formula }]))

describe('duplicate-formulas rule', () => {
  it('flags three or more identical formulas as one finding', () => {
    const found = findingsOf({ A1: { value: 1 }, ...same(4, '=A1*2') }, RULE)
    expect(found).toHaveLength(1)
    expect(found[0].cells).toHaveLength(4)
  })

  it('ignores two copies and treats letter case as the same formula', () => {
    expect(findingsOf({ A1: { value: 1 }, ...same(2, '=A1*2') }, RULE)).toEqual([])
    const mixed = { A1: { value: 1 }, B1: { value: null, formula: '=sum(A1)' }, B2: { value: null, formula: '=SUM(A1)' }, B3: { value: null, formula: '=Sum(A1)' } }
    expect(findingsOf(mixed, RULE)).toHaveLength(1)
  })
})

