/**
 * Property-Based Tests for ONNX Routing Heuristic
 *
 * Property 3: Routing Heuristic Correctness
 * For any random RoutingInput tuple, the decision must match the specification:
 * 1. User preference always wins
 * 2. Memory pressure → force server
 * 3. cellCount < 5000 AND modelSize < 50MB → local
 * 4. Otherwise → server (with fallback logic when unreachable)
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { selectExecutionPath, type RoutingInput } from './routingHeuristic'
import type { ExecutionPath } from './types'

// ─── Constants (mirrored from implementation for verification) ───────────────

const SMALL_CELL_COUNT_LIMIT = 5000
const SMALL_MODEL_SIZE_BYTES = 50 * 1024 * 1024  // 50MB
const FALLBACK_MODEL_SIZE_BYTES = 100 * 1024 * 1024  // 100MB

// ─── Arbitraries ────────────────────────────────────────────────────────────

const executionPathArb: fc.Arbitrary<ExecutionPath> = fc.constantFrom('local', 'server')

const routingInputArb: fc.Arbitrary<RoutingInput> = fc.record({
  cellCount: fc.integer({ min: 0, max: 1_000_000 }),
  modelSizeBytes: fc.integer({ min: 0, max: 600 * 1024 * 1024 }), // up to 600MB
  userPreference: fc.option(executionPathArb, { nil: undefined }),
  serverReachable: fc.boolean(),
  browserMemoryPressure: fc.boolean(),
})

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Property 3: Routing Heuristic Correctness', () => {
  it('user preference always overrides all other signals', () => {
    fc.assert(
      fc.property(routingInputArb, executionPathArb, (input, preference) => {
        const inputWithPref = { ...input, userPreference: preference }
        const result = selectExecutionPath(inputWithPref)

        expect(result.path).toBe(preference)
        expect(result.reason).toBe('user_preference')
        expect(result.isFallback).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it('memory pressure forces server path (when no user preference)', () => {
    fc.assert(
      fc.property(routingInputArb, (input) => {
        const inputWithPressure = {
          ...input,
          userPreference: undefined,
          browserMemoryPressure: true,
        }
        const result = selectExecutionPath(inputWithPressure)

        expect(result.path).toBe('server')
        expect(result.reason).toBe('memory_pressure')
        expect(result.isFallback).toBe(true)
      }),
      { numRuns: 50 },
    )
  })

  it('small dataset + small model → local (no pressure, no preference, server reachable)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SMALL_CELL_COUNT_LIMIT - 1 }),
        fc.integer({ min: 0, max: SMALL_MODEL_SIZE_BYTES - 1 }),
        (cellCount, modelSizeBytes) => {
          const input: RoutingInput = {
            cellCount,
            modelSizeBytes,
            userPreference: undefined,
            serverReachable: true,
            browserMemoryPressure: false,
          }
          const result = selectExecutionPath(input)

          expect(result.path).toBe('local')
          expect(result.reason).toBe('small_dataset')
          expect(result.isFallback).toBe(false)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('large dataset → server when reachable (no pressure, no preference)', () => {
    fc.assert(
      fc.property(
        // At least one of cellCount or modelSize exceeds the "small" threshold
        fc.integer({ min: SMALL_CELL_COUNT_LIMIT, max: 1_000_000 }),
        fc.integer({ min: 0, max: 600 * 1024 * 1024 }),
        (cellCount, modelSizeBytes) => {
          const input: RoutingInput = {
            cellCount,
            modelSizeBytes,
            userPreference: undefined,
            serverReachable: true,
            browserMemoryPressure: false,
          }
          const result = selectExecutionPath(input)

          expect(result.path).toBe('server')
          expect(result.reason).toBe('large_dataset')
          expect(result.isFallback).toBe(false)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('server unreachable + eligible for fallback → local with isFallback=true', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: SMALL_CELL_COUNT_LIMIT - 1 }),
        fc.integer({ min: SMALL_MODEL_SIZE_BYTES, max: FALLBACK_MODEL_SIZE_BYTES - 1 }),
        (cellCount, modelSizeBytes) => {
          const input: RoutingInput = {
            cellCount,
            modelSizeBytes,
            userPreference: undefined,
            serverReachable: false,
            browserMemoryPressure: false,
          }
          const result = selectExecutionPath(input)

          expect(result.path).toBe('local')
          expect(result.reason).toBe('server_unreachable_fallback')
          expect(result.isFallback).toBe(true)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('server unreachable + too large for fallback → server (will error downstream)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: SMALL_CELL_COUNT_LIMIT, max: 1_000_000 }),
        fc.integer({ min: FALLBACK_MODEL_SIZE_BYTES, max: 600 * 1024 * 1024 }),
        (cellCount, modelSizeBytes) => {
          const input: RoutingInput = {
            cellCount,
            modelSizeBytes,
            userPreference: undefined,
            serverReachable: false,
            browserMemoryPressure: false,
          }
          const result = selectExecutionPath(input)

          expect(result.path).toBe('server')
          expect(result.reason).toBe('large_dataset_server_required')
          expect(result.isFallback).toBe(false)
        },
      ),
      { numRuns: 30 },
    )
  })

  it('decision is always deterministic for the same input', () => {
    fc.assert(
      fc.property(routingInputArb, (input) => {
        const result1 = selectExecutionPath(input)
        const result2 = selectExecutionPath(input)

        expect(result1).toEqual(result2)
      }),
      { numRuns: 100 },
    )
  })
})
