import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

const RULE = 'hidden-dependencies'

describe('hidden-dependencies rule', () => {
  it('flags a formula that reads another sheet', () => {
    const [f] = findingsOf({ A1: { value: null, formula: "=Rates!B2*'Q3 Data'!C4" } }, RULE)
    expect(f.severity).toBe('medium')
    expect(f.message).toContain('Rates')
    expect(f.message).toContain('Q3 Data')
  })

  it('ignores the sheet itself, quoted text and plain formulas', () => {
    expect(findingsOf({ A1: { value: null, formula: '=Sheet1!B2' }, B2: { value: 1 } }, RULE)).toEqual([])
    expect(findingsOf({ A1: { value: null, formula: '="Other!A1"' } }, RULE)).toEqual([])
    expect(findingsOf({ A1: { value: null, formula: '=B1+1' } }, RULE)).toEqual([])
  })

  it('collapses many cross-sheet formulas into one info finding', () => {
    const found = findingsOf(fill('A', 1, 8, (r) => `=Data!A${r}`), RULE)
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('info')
    expect(found[0].title).toContain('8')
  })
})
