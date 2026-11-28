import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'
import { looksLikeNumber } from '../rules/numbersAsText'

const RULE = 'numbers-as-text'

describe('looksLikeNumber', () => {
  it.each(['12', '1,234.50', '$99', '-5', '(300)', '12%', ' 7 '])('accepts %s', (text) => {
    expect(looksLikeNumber(text)).toBe(true)
  })
  it.each(['abc', '', '02134', '12 apples', '1.2.3', '1234567890123', 'Q3'])('rejects %s', (text) => {
    expect(looksLikeNumber(text)).toBe(false)
  })
})

describe('numbers-as-text rule', () => {
  it('flags text numbers in a mostly numeric column as one finding', () => {
    const cells = { ...fill('A', 1, 8, (r) => r * 10), A3: { value: '30' }, A6: { value: '$60' } }
    const found = findingsOf(cells, RULE)
    expect(found).toHaveLength(1)
    expect(found[0].cells.map((c) => c.cellId)).toEqual(['A3', 'A6'])
    expect(found[0].autoFixable).toBe(false)
  })

  it('ignores a text column and a header above numbers', () => {
    const labels = fill('A', 1, 6, (r) => `item ${r}`)
    expect(findingsOf(labels, RULE)).toEqual([])
    const withHeader = { A1: { value: 'Amount' }, ...fill('A', 2, 7, (r) => r) }
    expect(findingsOf(withHeader, RULE)).toEqual([])
  })

  it('leaves identifiers with leading zeros alone', () => {
    const cells = { ...fill('A', 1, 6, (r) => r), A3: { value: '02134' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('needs at least three real numbers to call a column numeric', () => {
    const cells = { A1: { value: 1 }, A2: { value: 2 }, A3: { value: '3' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })
})
