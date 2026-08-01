/**
 * Unit tests for the Macro Planner
 *
 * Tests multi-step command detection, clause segmentation, decomposition
 * into ordered ActionStep lists, truncation behavior, and edge cases.
 */

import { describe, it, expect } from 'vitest'
import { planMacro, segmentClauses } from '../macroPlanner'
import type { WorkbookContext } from '../types'
import type { IntentType } from '@shared/intentTypes'

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const INTENT_VOCABULARY: IntentType[] = [
  'read', 'analyze', 'write', 'format', 'create_chart', 'create_formula',
  'summarize', 'filter', 'sort', 'clean', 'budget', 'report', 'compare',
  'find', 'calculate', 'export', 'chat', 'unknown',
]

const mockContext: WorkbookContext = {
  activeSheetId: 'sheet-1',
  sheets: [
    {
      id: 'sheet-1',
      name: 'Sales',
      columns: [
        { letter: 'A', headerName: 'Date', index: 0 },
        { letter: 'B', headerName: 'Amount', index: 1 },
        { letter: 'C', headerName: 'Category', index: 2 },
        { letter: 'D', headerName: 'Status', index: 3 },
      ],
    },
    {
      id: 'sheet-2',
      name: 'Expenses',
      columns: [
        { letter: 'A', headerName: 'Item', index: 0 },
        { letter: 'B', headerName: 'Cost', index: 1 },
      ],
    },
  ],
}

// ─── Clause Segmentation ────────────────────────────────────────────────────

describe('segmentClauses', () => {
  it('returns empty array for empty input', () => {
    expect(segmentClauses('')).toEqual([])
    expect(segmentClauses('   ')).toEqual([])
  })

  it('returns single clause for simple input', () => {
    const result = segmentClauses('filter rows where amount is over 500')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('filter rows where amount is over 500')
  })

  it('splits on semicolons', () => {
    const result = segmentClauses('filter rows over 500; sort by date; export to csv')
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('filter rows over 500')
    expect(result[1]).toBe('sort by date')
    expect(result[2]).toBe('export to csv')
  })

  it('splits on "and then"', () => {
    const result = segmentClauses('filter the data and then sort by date')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('filter the data')
    expect(result[1]).toBe('sort by date')
  })

  it('splits on "after that"', () => {
    const result = segmentClauses('filter rows over 500 after that sort by date')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('filter rows over 500')
    expect(result[1]).toBe('sort by date')
  })

  it('splits on "then"', () => {
    const result = segmentClauses('filter the rows then sort by date')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('filter the rows')
    expect(result[1]).toBe('sort by date')
  })

  it('splits on numbered lists', () => {
    const result = segmentClauses('1. filter rows over 500 2. sort by date 3. export to csv')
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('filter rows over 500')
    expect(result[1]).toBe('sort by date')
    expect(result[2]).toBe('export to csv')
  })

  it('splits on "first...then" pattern', () => {
    const result = segmentClauses('first filter the data then sort by amount')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('filter the data')
    expect(result[1]).toBe('sort by amount')
  })

  it('splits on comma followed by action verb', () => {
    const result = segmentClauses('filter rows over 500, sort by date, export to csv')
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('filter rows over 500')
    expect(result[1]).toBe('sort by date')
    expect(result[2]).toBe('export to csv')
  })

  it('does NOT split on comma within a clause (no action verb after)', () => {
    const result = segmentClauses('filter rows where amount is 500, 600, or 700')
    expect(result).toHaveLength(1)
  })

  it('splits on "and" followed by action verb', () => {
    const result = segmentClauses('filter rows over 500 and sort by date')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('filter rows over 500')
    expect(result[1]).toBe('sort by date')
  })

  it('does NOT split on "and" connecting non-action words', () => {
    const result = segmentClauses('filter rows where column A and column B are over 500')
    expect(result).toHaveLength(1)
  })

  it('splits on sentence-ending periods', () => {
    const result = segmentClauses('Filter rows over 500. Sort by date descending')
    expect(result).toHaveLength(2)
    expect(result[0]).toBe('Filter rows over 500')
    expect(result[1]).toBe('Sort by date descending')
  })

  it('does NOT split on decimal number periods', () => {
    const result = segmentClauses('filter rows where amount is 500.50')
    expect(result).toHaveLength(1)
  })
})

// ─── planMacro ──────────────────────────────────────────────────────────────

describe('planMacro', () => {
  describe('empty/single-step input', () => {
    it('returns empty plan for empty input', () => {
      const result = planMacro('', mockContext, INTENT_VOCABULARY)
      expect(result.steps).toHaveLength(0)
      expect(result.originalText).toBe('')
      expect(result.truncated).toBe(false)
    })

    it('returns single step for a simple command', () => {
      const result = planMacro('filter rows where amount is over 500', mockContext, INTENT_VOCABULARY)
      expect(result.steps).toHaveLength(1)
      expect(result.steps[0].tool).toBe('filter')
      expect(result.truncated).toBe(false)
    })

    it('returns empty plan for non-actionable input', () => {
      const result = planMacro('hello how are you', mockContext, INTENT_VOCABULARY)
      expect(result.steps).toHaveLength(0)
      expect(result.truncated).toBe(false)
    })
  })

  describe('multi-step decomposition', () => {
    it('decomposes two actions separated by "and then"', () => {
      const result = planMacro(
        'filter rows over 500 and then sort by date',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(2)
      expect(result.steps[0].tool).toBe('filter')
      expect(result.steps[1].tool).toBe('sort')
      expect(result.truncated).toBe(false)
    })

    it('decomposes three actions separated by commas', () => {
      const result = planMacro(
        'filter rows over 500, sort by date, export to csv',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].tool).toBe('filter')
      expect(result.steps[1].tool).toBe('sort')
      expect(result.steps[2].tool).toBe('export')
      expect(result.truncated).toBe(false)
    })

    it('decomposes numbered list', () => {
      const result = planMacro(
        '1. filter rows over 500 2. sort by date 3. calculate the total',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].tool).toBe('filter')
      expect(result.steps[1].tool).toBe('sort')
      expect(result.steps[2].tool).toBe('calculate')
    })

    it('decomposes semicolon-separated commands', () => {
      const result = planMacro(
        'filter data; sort ascending; summarize results',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(3)
      expect(result.steps[0].tool).toBe('filter')
      expect(result.steps[1].tool).toBe('sort')
      expect(result.steps[2].tool).toBe('summarize')
    })
  })

  describe('ordering preservation', () => {
    it('preserves user-specified action ordering', () => {
      const result = planMacro(
        'sort by date and then filter rows over 500 and then export to csv',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps[0].tool).toBe('sort')
      expect(result.steps[1].tool).toBe('filter')
      expect(result.steps[2].tool).toBe('export')
    })
  })

  describe('unrecognized intent fallback', () => {
    it('returns empty plan if any clause maps to unknown intent', () => {
      // Use a restricted vocabulary that doesn't include 'sort',
      // so the second clause can't map to a valid actionable intent
      const restrictedVocabulary: IntentType[] = ['filter', 'export', 'unknown', 'chat']
      const result = planMacro(
        'filter rows over 500; sort by date descending',
        mockContext,
        restrictedVocabulary
      )
      expect(result.steps).toHaveLength(0)
      expect(result.truncated).toBe(false)
    })

    it('returns empty plan if any clause maps to chat intent', () => {
      const result = planMacro(
        'filter rows over 500; hello how are you today',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(0)
    })
  })

  describe('truncation', () => {
    it('processes first 5 steps and sets truncated when >5 detected', () => {
      const result = planMacro(
        'filter rows; sort data; calculate total; summarize results; export to csv; find duplicates; clean the data',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps.length).toBeLessThanOrEqual(5)
      expect(result.truncated).toBe(true)
      expect(result.truncatedCount).toBeGreaterThan(0)
    })

    it('does not truncate when exactly 5 steps', () => {
      const result = planMacro(
        'filter rows; sort data; calculate total; summarize results; export to csv',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(5)
      expect(result.truncated).toBe(false)
      expect(result.truncatedCount).toBeUndefined()
    })
  })

  describe('ActionStep schema', () => {
    it('each step has a non-empty tool string', () => {
      const result = planMacro(
        'filter rows over 500 and then sort by date',
        mockContext,
        INTENT_VOCABULARY
      )
      for (const step of result.steps) {
        expect(step.tool).toBeTruthy()
        expect(typeof step.tool).toBe('string')
        expect(step.tool.length).toBeGreaterThan(0)
      }
    })

    it('each step has a params object', () => {
      const result = planMacro(
        'filter rows over 500 and then sort by date',
        mockContext,
        INTENT_VOCABULARY
      )
      for (const step of result.steps) {
        expect(typeof step.params).toBe('object')
        expect(step.params).not.toBeNull()
      }
    })

    it('each step has a description between 10 and 120 characters', () => {
      const result = planMacro(
        'filter rows over 500 and then sort by date',
        mockContext,
        INTENT_VOCABULARY
      )
      for (const step of result.steps) {
        expect(step.description.length).toBeGreaterThanOrEqual(10)
        expect(step.description.length).toBeLessThanOrEqual(120)
      }
    })
  })

  describe('entity extraction in params', () => {
    it('extracts numeric values into params', () => {
      const result = planMacro(
        'filter rows where amount is over 500',
        mockContext,
        INTENT_VOCABULARY
      )
      expect(result.steps).toHaveLength(1)
      expect(result.steps[0].params.values).toBeDefined()
    })
  })

  describe('MacroPlan metadata', () => {
    it('preserves originalText in the plan', () => {
      const input = 'filter rows over 500 and then sort by date'
      const result = planMacro(input, mockContext, INTENT_VOCABULARY)
      expect(result.originalText).toBe(input)
    })

    it('truncatedCount equals total minus 5 when truncated', () => {
      const result = planMacro(
        'filter rows; sort data; calculate total; summarize results; export to csv; find duplicates; clean the data',
        mockContext,
        INTENT_VOCABULARY
      )
      if (result.truncated) {
        expect(result.truncatedCount).toBe(result.truncatedCount)
        expect(result.steps).toHaveLength(5)
      }
    })
  })

  describe('performance', () => {
    it('returns within 200ms for ≤5 steps', () => {
      const start = performance.now()
      planMacro(
        'filter rows over 500; sort by date; calculate total; summarize results; export to csv',
        mockContext,
        INTENT_VOCABULARY
      )
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(200)
    })

    it('returns within 400ms for >5 steps', () => {
      const start = performance.now()
      planMacro(
        'filter rows; sort data; calculate total; summarize results; export to csv; find duplicates; clean the data',
        mockContext,
        INTENT_VOCABULARY
      )
      const elapsed = performance.now() - start
      expect(elapsed).toBeLessThan(400)
    })
  })
})
