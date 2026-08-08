import { describe, it, expect } from 'vitest'
import { validateLabel, parseAllowlist, parseSentiment } from './labelValidation.js'

describe('validateLabel', () => {
  const categories = ['Food', 'Transport', 'Bills', 'Entertainment', 'Shopping']

  it('returns exact match unchanged', () => {
    const result = validateLabel('Food', categories)
    expect(result.label).toBe('Food')
    expect(result.corrected).toBe(false)
  })

  it('matches case-insensitively', () => {
    const result = validateLabel('food', categories)
    expect(result.label).toBe('Food')
    expect(result.corrected).toBe(true)
  })

  it('matches case-insensitively (upper)', () => {
    const result = validateLabel('TRANSPORT', categories)
    expect(result.label).toBe('Transport')
    expect(result.corrected).toBe(true)
  })

  it('fuzzy matches within Levenshtein distance 2', () => {
    const result = validateLabel('Transprot', categories) // typo
    expect(result.label).toBe('Transport')
    expect(result.corrected).toBe(true)
    expect(result.original).toBe('Transprot')
  })

  it('fuzzy matches "Bil" to "Bills" via distance', () => {
    const result = validateLabel('Bil', categories)
    expect(result.label).toBe('Bills')
    expect(result.corrected).toBe(true)
  })

  it('matches via substring containment', () => {
    const result = validateLabel('Food & Dining', ['Food', 'Transport'])
    expect(result.label).toBe('Food')
    expect(result.corrected).toBe(true)
  })

  it('returns original with warning when no match found', () => {
    const result = validateLabel('Cryptocurrency', categories)
    expect(result.label).toBe('Cryptocurrency')
    expect(result.corrected).toBe(false)
    expect(result.warning).toContain('not in the allowlist')
  })

  it('handles empty allowlist gracefully', () => {
    const result = validateLabel('anything', [])
    expect(result.label).toBe('anything')
    expect(result.corrected).toBe(false)
  })

  it('trims whitespace from label', () => {
    const result = validateLabel('  Food  ', categories)
    expect(result.label).toBe('Food')
  })
})

describe('parseAllowlist', () => {
  it('parses comma-separated string', () => {
    expect(parseAllowlist('Food, Transport, Bills')).toEqual(['Food', 'Transport', 'Bills'])
  })

  it('parses pipe-separated string', () => {
    expect(parseAllowlist('Food|Transport|Bills')).toEqual(['Food', 'Transport', 'Bills'])
  })

  it('parses array input', () => {
    expect(parseAllowlist(['Food', 'Transport'])).toEqual(['Food', 'Transport'])
  })

  it('returns empty for null/undefined', () => {
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist(undefined)).toEqual([])
  })

  it('filters empty strings', () => {
    expect(parseAllowlist('Food,,Transport,,')).toEqual(['Food', 'Transport'])
  })
})

describe('parseSentiment', () => {
  it('parses "label|confidence" format', () => {
    const result = parseSentiment('positive|0.92')
    expect(result.label).toBe('positive')
    expect(result.confidence).toBeCloseTo(0.92)
  })

  it('parses "label:confidence" format', () => {
    const result = parseSentiment('negative:0.78')
    expect(result.label).toBe('negative')
    expect(result.confidence).toBeCloseTo(0.78)
  })

  it('parses plain label with default confidence', () => {
    const result = parseSentiment('positive')
    expect(result.label).toBe('positive')
    expect(result.confidence).toBe(0.8)
  })

  it('parses negative with default confidence', () => {
    const result = parseSentiment('negative')
    expect(result.label).toBe('negative')
    expect(result.confidence).toBe(0.8)
  })

  it('parses neutral with default confidence', () => {
    const result = parseSentiment('neutral')
    expect(result.label).toBe('neutral')
    expect(result.confidence).toBe(0.8)
  })

  it('handles mixed case', () => {
    const result = parseSentiment('Positive|0.85')
    expect(result.label).toBe('positive')
    expect(result.confidence).toBeCloseTo(0.85)
  })

  it('falls back to neutral with low confidence for unparseable input', () => {
    const result = parseSentiment('I think this is good')
    expect(result.label).toBe('neutral')
    expect(result.confidence).toBe(0.5)
  })

  it('handles verbose format "positive (confidence: 0.9)"', () => {
    const result = parseSentiment('positive (confidence: 0.9)')
    expect(result.label).toBe('positive')
    expect(result.confidence).toBeCloseTo(0.9)
  })

  it('clamps confidence to [0, 1]', () => {
    const result = parseSentiment('positive|1.5')
    expect(result.confidence).toBe(1)
  })
})
