import { describe, expect, it } from 'vitest'
import { findingsOf } from '../__tests__/helpers'

const RULE = 'volatile-functions'
const run = (formula: string) => findingsOf({ A1: { value: 1 }, B1: { value: null, formula } }, RULE)

describe('volatile-functions rule', () => {
  it.each(['=NOW()', '=TODAY()+1', '=RAND()', '=RANDBETWEEN(1,6)', '=INDIRECT("A1")', '=SUM(OFFSET(A1,0,1))'])('flags %s', (formula) => {
    expect(run(formula)).toHaveLength(1)
  })

  it('does not match similarly named functions or text inside quotes', () => {
    expect(run('=KNOW(A1)')).toEqual([])
    expect(run('="call NOW() later"')).toEqual([])
    expect(run('=SUM(A1)')).toEqual([])
  })

  it('reports one finding per cell, at info severity', () => {
    const found = run('=NOW()+RAND()')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('info')
  })
})
