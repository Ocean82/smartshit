import { describe, expect, it } from 'vitest'
import { findingsOf } from '../__tests__/helpers'

const RULE = 'error-cells'
const withError = (formula: string, error: string) =>
  findingsOf({ A1: { value: 0 }, B1: { value: null, formula } }, RULE, (id) => (id === 'B1' ? error : ''))

describe('error-cells rule', () => {
  it.each([
    ['#REF!', 'critical'],
    ['#DIV/0!', 'critical'],
    ['#CIRC!', 'critical'],
    ['#VALUE!', 'high'],
    ['#NUM!', 'high'],
    ['#SPILL!', 'high'],
    ['#CALC!', 'high'],
    ['#NAME?', 'medium'],
    ['#N/A', 'medium'],
  ])('rates %s as %s', (error, severity) => {
    const [f] = withError('=A1', error)
    expect(f.severity).toBe(severity)
  })

  it.each(['#CIRC!', '#SPILL!', '#CALC!'])('explains %s instead of calling it unknown', (error) => {
    const [f] = withError('=A1', error)
    expect(f.message).not.toContain('Unknown error type')
    expect(f.suggestion).not.toBe('Review and correct the formula')
  })

  it('offers an IFERROR fix only for #DIV/0!', () => {
    expect(withError('=1/A1', '#DIV/0!')[0].fixActions).toEqual([{ cellId: 'B1', formula: '=IFERROR(1/A1, 0)' }])
    expect(withError('=A1', '#N/A')[0].autoFixable).toBe(false)
  })

  it('reports an error typed into a plain cell without a fix', () => {
    const [f] = findingsOf({ A1: { value: '#REF!' } }, RULE, () => '#REF!')
    expect(f.autoFixable).toBe(false)
  })
})
