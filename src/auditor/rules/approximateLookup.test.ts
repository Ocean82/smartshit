import { describe, expect, it } from 'vitest'
import { findingsOf } from '../__tests__/helpers'
import { findFunctionCalls } from '../utils'

const RULE = 'approximate-lookup'
const run = (formula: string) => findingsOf({ A1: { value: 1 }, B1: { value: null, formula } }, RULE)

describe('findFunctionCalls', () => {
  it('splits top-level arguments and ignores nested commas and strings', () => {
    expect(findFunctionCalls('=VLOOKUP(A1,IF(B1,C1:D9,E1:F9),2,"a,b")', ['VLOOKUP'])).toEqual([
      { name: 'VLOOKUP', args: ['A1', 'IF(B1,C1:D9,E1:F9)', '2', '"a,b"'] },
    ])
  })

  it('finds nested calls, skips similarly named functions and unclosed calls', () => {
    const f = 'MATCH(1,A1:A3)+XMATCH(1,A1:A3)+SUM(MATCH(2,B1:B3,0))+MATCH(1,'
    expect(findFunctionCalls(f, ['MATCH']).map((c) => c.args.length)).toEqual([2, 3])
  })
})

describe('approximate-lookup rule', () => {
  it('flags VLOOKUP and HLOOKUP with no match-mode argument', () => {
    expect(run('=VLOOKUP(A1,C1:D9,2)')).toHaveLength(1)
    expect(run('=HLOOKUP(A1,C1:F2,2)')).toHaveLength(1)
  })

  it('flags an explicit TRUE or 1 and a MATCH that defaults to sorted order', () => {
    expect(run('=VLOOKUP(A1,C1:D9,2,TRUE)')).toHaveLength(1)
    expect(run('=VLOOKUP(A1,C1:D9,2,1)')).toHaveLength(1)
    expect(run('=MATCH(A1,C1:C9)')).toHaveLength(1)
    expect(run('=MATCH(A1,C1:C9,1)')).toHaveLength(1)
  })

  it('accepts exact-match lookups', () => {
    expect(run('=VLOOKUP(A1,C1:D9,2,FALSE)')).toEqual([])
    expect(run('=VLOOKUP(A1,C1:D9,2,0)')).toEqual([])
    expect(run('=MATCH(A1,C1:C9,0)')).toEqual([])
    expect(run('=XLOOKUP(A1,C1:C9,D1:D9)')).toEqual([])
  })

  it('ignores lookups that appear only inside text', () => {
    expect(run('="VLOOKUP(A1,C1:D9,2)"')).toEqual([])
  })

  it('never offers an automatic fix, since exact and approximate answers differ', () => {
    expect(run('=VLOOKUP(A1,C1:D9,2)')[0].autoFixable).toBe(false)
  })
})
