import { describe, expect, it } from 'vitest'
import { computeHealthScore } from './score'
import type { AuditFinding, Severity } from './types'

function finding(ruleId: string, severity: Severity): AuditFinding {
  return { id: ruleId + severity, ruleId, severity, title: '', message: '', cells: [], autoFixable: false }
}
const many = (n: number, ruleId: string, severity: Severity) => Array.from({ length: n }, () => finding(ruleId, severity))

describe('computeHealthScore', () => {
  it('is 100 with no findings and weights severities on a small sheet', () => {
    expect(computeHealthScore([], 10)).toBe(100)
    expect(computeHealthScore([finding('a', 'critical'), finding('b', 'high'), finding('c', 'medium'), finding('d', 'low'), finding('e', 'info')], 10)).toBe(100 - 20 - 10 - 5 - 2)
  })

  it('caps one rule at 40 points', () => {
    expect(computeHealthScore(many(30, 'a', 'critical'), 30)).toBe(60)
  })

  it('does not let a large sheet hide a critical error', () => {
    expect(computeHealthScore([finding('a', 'critical')], 5000)).toBe(80)
  })

  it('judges non-critical findings by how common they are in a large sheet', () => {
    const tenHigh = many(10, 'a', 'high')
    const small = computeHealthScore(tenHigh, 50)
    const large = computeHealthScore(tenHigh, 1000)
    expect(small).toBe(60) // 100 points of weight, capped at 40
    expect(large).toBe(90) // the same 100 points spread over 1000 formulas count as 10
  })

  it('stays within 0 to 100', () => {
    const everything = ['a', 'b', 'c', 'd', 'e'].flatMap((id) => many(20, id, 'critical'))
    expect(computeHealthScore(everything, 10)).toBe(0)
  })
})
