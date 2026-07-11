import { describe, expect, it } from 'vitest'
import { getSuggestions, scoreSuggestion, tokenize } from './suggestions.js'

describe('tokenize', () => {
  it('drops stop words and punctuation', () => {
    expect(tokenize('Where am I overspending on food?')).toEqual(['where', 'overspending', 'food'])
  })
})

describe('scoreSuggestion', () => {
  it('scores keyword hits higher than query-text hits', () => {
    const tokens = tokenize('budget spending save')
    const score = scoreSuggestion(tokens, {
      query: 'Generate a budget breakdown',
      intentType: 'budget',
      keywords: ['budget', 'expense', 'income', 'spending', 'cost', 'save'],
    })
    expect(score).toBeGreaterThan(5)
  })
})

describe('getSuggestions', () => {
  it('returns budget-related suggestions for spending queries', () => {
    const suggestions = getSuggestions('Where am I overspending?', 3)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some((s) => /budget|save|overspend|spending/i.test(s))).toBe(true)
  })

  it('returns fallback suggestions for unrelated gibberish', () => {
    const suggestions = getSuggestions('zzzz qq xx', 3)
    expect(suggestions).toHaveLength(3)
  })
})
