import { describe, expect, it } from 'vitest'
import { parseUserIntent } from './intentParser.js'

describe('parseUserIntent', () => {
  it('extracts top N for expense queries as filter', () => {
    const intent = parseUserIntent('Show top 5 expenses')
    expect(intent.intentType).toBe('filter')
    expect(intent.parameters.n).toBe(5)
  })

  it('detects sort with descending column', () => {
    const intent = parseUserIntent('Sort column B descending')
    expect(intent.intentType).toBe('sort')
    expect(intent.targetColumns).toContain('B')
    expect(intent.parameters.ascending).toBe(false)
  })

  it('promotes budget intent for financial explain queries', () => {
    const intent = parseUserIntent('Explain my expenses')
    expect(intent.intentType).toBe('budget')
  })

  it('detects budget building requests', () => {
    const intent = parseUserIntent('Build a monthly budget')
    expect(intent.intentType).toBe('budget')
  })

  it('extracts monthly income from advise questions', () => {
    const intent = parseUserIntent('I make $5000/month, what should I save?')
    expect(intent.parameters.monthlyIncome).toBe(5000)
  })
})
