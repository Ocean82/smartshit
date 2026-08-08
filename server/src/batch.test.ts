import { describe, it, expect, beforeEach } from 'vitest'
import { estimateBatchCost, clearBatchCache, type BatchInput } from './batch.js'

describe('batch processing', () => {
  beforeEach(() => {
    clearBatchCache()
  })

  describe('estimateBatchCost', () => {
    it('estimates 0 calls for empty input', () => {
      const result = estimateBatchCost([])
      expect(result.uniqueInputs).toBe(0)
      expect(result.estimatedCalls).toBe(0)
      expect(result.cachedCount).toBe(0)
    })

    it('estimates 1 call for ≤10 unique inputs', () => {
      const inputs: BatchInput[] = Array.from({ length: 5 }, (_, i) => ({
        id: `cell-${i}`,
        function: 'AI.CATEGORIZE',
        args: { input: `transaction ${i}`, categories: 'Food,Transport' },
      }))
      const result = estimateBatchCost(inputs)
      expect(result.uniqueInputs).toBe(5)
      expect(result.estimatedCalls).toBe(1)
      expect(result.cachedCount).toBe(0)
    })

    it('estimates 2 calls for 11-20 unique inputs', () => {
      const inputs: BatchInput[] = Array.from({ length: 15 }, (_, i) => ({
        id: `cell-${i}`,
        function: 'AI.CATEGORIZE',
        args: { input: `transaction ${i}`, categories: 'Food,Transport' },
      }))
      const result = estimateBatchCost(inputs)
      expect(result.uniqueInputs).toBe(15)
      expect(result.estimatedCalls).toBe(2)
    })

    it('deduplicates identical inputs in estimate', () => {
      const inputs: BatchInput[] = [
        { id: 'cell-1', function: 'AI.CATEGORIZE', args: { input: 'coffee', categories: 'Food,Transport' } },
        { id: 'cell-2', function: 'AI.CATEGORIZE', args: { input: 'coffee', categories: 'Food,Transport' } },
        { id: 'cell-3', function: 'AI.CATEGORIZE', args: { input: 'uber', categories: 'Food,Transport' } },
      ]
      const result = estimateBatchCost(inputs)
      expect(result.uniqueInputs).toBe(2) // "coffee" and "uber"
      expect(result.estimatedCalls).toBe(1)
    })
  })
})
