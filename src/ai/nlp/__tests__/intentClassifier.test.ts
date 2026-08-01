/**
 * Unit tests for the Intent Classifier
 *
 * Tests embedding-based classification, Levenshtein typo correction,
 * cosine similarity, empty input handling, and performance.
 */

import { describe, it, expect } from 'vitest'
import {
  classifyIntent,
  levenshteinDistance,
  correctTypos,
  cosineSimilarity,
} from '../intentClassifier'

// ─── Levenshtein Distance ───────────────────────────────────────────────────

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
    expect(levenshteinDistance('', '')).toBe(0)
  })

  it('returns length of other string when one is empty', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3)
    expect(levenshteinDistance('hello', '')).toBe(5)
  })

  it('computes single-character edits correctly', () => {
    // substitution
    expect(levenshteinDistance('cat', 'bat')).toBe(1)
    // insertion
    expect(levenshteinDistance('cat', 'cats')).toBe(1)
    // deletion
    expect(levenshteinDistance('cats', 'cat')).toBe(1)
  })

  it('computes multi-character edits correctly', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('filter', 'filtre')).toBe(2)
    expect(levenshteinDistance('sort', 'srot')).toBe(2)
  })

  it('is symmetric', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(
      levenshteinDistance('xyz', 'abc')
    )
    expect(levenshteinDistance('filter', 'fliter')).toBe(
      levenshteinDistance('fliter', 'filter')
    )
  })
})

// ─── Typo Correction ────────────────────────────────────────────────────────

describe('correctTypos', () => {
  const vocabulary = ['filter', 'sort', 'analyze', 'format', 'chart', 'calculate', 'summarize']

  it('does not modify words shorter than 4 characters', () => {
    expect(correctTypos('sum the', vocabulary)).toBe('sum the')
  })

  it('does not modify words already in vocabulary', () => {
    expect(correctTypos('filter sort', vocabulary)).toBe('filter sort')
  })

  it('corrects single-character typos in words ≥4 chars', () => {
    expect(correctTypos('filtr', vocabulary)).toBe('filter')
    expect(correctTypos('analize', vocabulary)).toBe('analyze')
  })

  it('corrects two-character typos in words ≥4 chars', () => {
    expect(correctTypos('fliter', vocabulary)).toBe('filter')
    expect(correctTypos('sumarize', vocabulary)).toBe('summarize')
  })

  it('does not correct words with more than 2 edits', () => {
    expect(correctTypos('xxxxx', vocabulary)).toBe('xxxxx')
  })

  it('handles empty input', () => {
    expect(correctTypos('', vocabulary)).toBe('')
  })

  it('preserves spacing between words', () => {
    expect(correctTypos('filtr the data', vocabulary)).toBe('filter the data')
  })
})

// ─── Cosine Similarity ──────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical non-zero vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0)
  })

  it('returns 0 for zero vectors', () => {
    expect(cosineSimilarity([0, 0, 0], [0, 0, 0])).toBe(0)
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('returns value between 0 and 1 for non-negative vectors', () => {
    const sim = cosineSimilarity([1, 2, 3], [4, 5, 6])
    expect(sim).toBeGreaterThan(0)
    expect(sim).toBeLessThanOrEqual(1)
  })

  it('handles scalar multiples (same direction)', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5)
  })
})

// ─── Intent Classification ──────────────────────────────────────────────────

describe('classifyIntent', () => {
  describe('empty/whitespace handling', () => {
    it('returns unknown with confidence 0 for empty string', () => {
      const result = classifyIntent('')
      expect(result.intentType).toBe('unknown')
      expect(result.confidence).toBe(0)
      expect(result.entities).toEqual([])
      expect(result.isMultiStep).toBe(false)
    })

    it('returns unknown with confidence 0 for whitespace-only', () => {
      const result = classifyIntent('   ')
      expect(result.intentType).toBe('unknown')
      expect(result.confidence).toBe(0)
    })

    it('returns unknown with confidence 0 for tabs and newlines', () => {
      const result = classifyIntent('\t\n  \r\n')
      expect(result.intentType).toBe('unknown')
      expect(result.confidence).toBe(0)
    })
  })

  describe('correct classification', () => {
    it('classifies "filter rows" as filter', () => {
      const result = classifyIntent('filter rows where amount is greater than 500')
      expect(result.intentType).toBe('filter')
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it('classifies "sort the data" as sort', () => {
      const result = classifyIntent('sort the data by date')
      expect(result.intentType).toBe('sort')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies "create a chart" as create_chart', () => {
      const result = classifyIntent('create a bar chart for sales')
      expect(result.intentType).toBe('create_chart')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies "summarize this data" as summarize', () => {
      const result = classifyIntent('summarize the quarterly results')
      expect(result.intentType).toBe('summarize')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies "calculate the total" as calculate', () => {
      const result = classifyIntent('calculate the sum of column A')
      expect(result.intentType).toBe('calculate')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies "export to csv" as export', () => {
      const result = classifyIntent('export this sheet to csv')
      expect(result.intentType).toBe('export')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies "format the cells" as format', () => {
      const result = classifyIntent('format column B as bold and red')
      expect(result.intentType).toBe('format')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies "find duplicates" as find', () => {
      const result = classifyIntent('find duplicate entries in column A')
      expect(result.intentType).toBe('find')
      expect(result.confidence).toBeGreaterThan(0)
    })
  })

  describe('typo tolerance', () => {
    it('classifies "filtr" correctly as filter', () => {
      const result = classifyIntent('filtr the data')
      expect(result.intentType).toBe('filter')
    })

    it('classifies "calcualte" correctly as calculate', () => {
      const result = classifyIntent('calcualte the average')
      expect(result.intentType).toBe('calculate')
    })

    it('classifies "sumarize" correctly as summarize', () => {
      const result = classifyIntent('sumarize the report')
      expect(result.intentType).toBe('summarize')
    })
  })

  describe('confidence bounds', () => {
    it('confidence is always between 0 and 1', () => {
      const inputs = [
        'filter data',
        'sort ascending',
        'xyzzy foobar baz',
        'a',
        'the quick brown fox',
      ]

      for (const input of inputs) {
        const result = classifyIntent(input)
        expect(result.confidence).toBeGreaterThanOrEqual(0)
        expect(result.confidence).toBeLessThanOrEqual(1)
      }
    })

    it('confidence is rounded to 2 decimal places', () => {
      const result = classifyIntent('filter the data by date column')
      const decimalPart = result.confidence.toString().split('.')[1] || ''
      expect(decimalPart.length).toBeLessThanOrEqual(2)
    })
  })

  describe('output schema', () => {
    it('returns all required ClassificationResult fields', () => {
      const result = classifyIntent('sort the data')
      expect(result).toHaveProperty('intentType')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('entities')
      expect(result).toHaveProperty('isMultiStep')
      expect(Array.isArray(result.entities)).toBe(true)
      expect(typeof result.isMultiStep).toBe('boolean')
    })

    it('intentType is a valid IntentType value', () => {
      const validIntents = [
        'read', 'analyze', 'write', 'format', 'create_chart',
        'create_formula', 'summarize', 'filter', 'sort', 'clean',
        'budget', 'report', 'compare', 'find', 'calculate',
        'export', 'chat', 'unknown',
      ]
      const result = classifyIntent('hello world')
      expect(validIntents).toContain(result.intentType)
    })
  })

  describe('performance', () => {
    it('classifies a 200-char input within 50ms', () => {
      const longInput = 'filter all the rows where the amount column is greater than five hundred dollars and sort them by date in descending order so I can see the most recent expensive transactions first please'
      expect(longInput.length).toBeLessThanOrEqual(200)

      const start = performance.now()
      classifyIntent(longInput)
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(50)
    })

    it('handles repeated classifications efficiently', () => {
      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        classifyIntent('filter the data by amount')
      }
      const elapsed = performance.now() - start

      // 100 classifications should complete in well under 5000ms (50ms each)
      expect(elapsed).toBeLessThan(5000)
    })
  })
})
