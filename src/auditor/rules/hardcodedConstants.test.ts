import { describe, expect, it } from 'vitest'
import { findingsOf } from '../__tests__/helpers'
import { findNumericLiterals } from '../utils'

const run = (formula: string, extra: Record<string, { value: number | string | null }> = {}) =>
  findingsOf({ A1: { value: 5 }, B17: { value: 3 }, ...extra, C1: { value: null, formula } }, 'hardcoded-constants')

describe('findNumericLiterals', () => {
  it('ignores references, ranges, sheet prefixes and string text', () => {
    const f = '=A1*$B$17+SUM($C$2:$C$40)+\'Q3 2024\'!D9+Sheet2!E3+LOG10(F4)+"x 99"'
    expect(findNumericLiterals(f)).toEqual([])
  })

  it('returns literals with their positions', () => {
    expect(findNumericLiterals('=A1*0.335+17')).toEqual([
      { text: '0.335', start: 4 },
      { text: '17', start: 10 },
    ])
  })

  it('reads leading-dot and exponent literals as one number', () => {
    expect(findNumericLiterals('=A1*.375+1E3').map((l) => l.text)).toEqual(['.375', '1E3'])
  })
})

describe('hardcoded-constants rule', () => {
  it('does not flag absolute references', () => {
    expect(run('=A1*$B$17')).toEqual([])
    expect(run('=SUM($C$2:$C$40)')).toEqual([])
    expect(run('=Sheet2!$B$17')).toEqual([])
  })

  it('still flags a real magic number and rewrites only the literal', () => {
    const [finding] = run('=A1*$B$17*0.335')
    expect(finding.title).toBe('Magic number 0.335 in C1')
    expect(finding.fixActions).toEqual([
      { cellId: 'D1', value: 0.335 },
      { cellId: 'C1', formula: '=A1*$B$17*D1' },
    ])
  })

  it('flags tax and markup rates that used to be allowlisted', () => {
    expect(run('=A1*1.2')).toHaveLength(1)
    expect(run('=A1*0.08')).toHaveLength(1)
  })

  it('keeps structural constants quiet', () => {
    expect(run('=A1/12+A1*100+A1/365')).toEqual([])
  })

  it('mentions every suspicious constant but fixes the first', () => {
    const [finding] = run('=A1*0.335+0.77')
    expect(finding.message).toContain('0.335')
    expect(finding.message).toContain('0.77')
    expect(finding.fixActions?.[1].formula).toBe('=A1*D1+0.77')
  })

  it('leaves quoted text that repeats the digits untouched', () => {
    const [finding] = run('=IF(A1>0,"0.335",A1*0.335)')
    expect(finding.fixActions?.[1].formula).toBe('=IF(A1>0,"0.335",A1*D1)')
  })
})
