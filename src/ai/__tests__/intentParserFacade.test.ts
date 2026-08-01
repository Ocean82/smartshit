/**
 * Unit tests for the Intent Parser Facade routing and fallback behavior.
 *
 * Tests verify:
 * - NLP used when ready, regex used when loading (Req 4.2, 4.3)
 * - Fallback to regex on NLP error within 2s (Req 4.5)
 * - In-flight request handling during state transitions (Req 4.6)
 * - 30-second readiness warning (Req 4.7)
 * - Identical parseUserIntent and isQueryIntent signatures (Req 4.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseUserIntent,
  parseUserIntentAsync,
  isQueryIntent,
  initializeNLPEngine,
  getNLPEngineState,
  isNLPReady,
  getInFlightCount,
  serializeIntent,
  deserializeIntent,
  _resetForTesting,
} from '../intentParser'
import type { UserIntent } from '@shared/intentTypes'
import type { NLPConfig, WorkbookContext } from '@/ai/nlp/types'

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock the NLP engine client
vi.mock('@/ai/nlp/nlpEngineClient', () => {
  let stateCallback: ((state: string) => void) | null = null
  let mockState = 'loading'

  return {
    createNLPEngineClient: vi.fn(() => {
      // Reset mock state each time a new client is created
      mockState = 'loading'
      stateCallback = null

      return {
        get state() { return mockState },
        onStateChange: vi.fn((cb: (state: string) => void) => {
          stateCallback = cb
          return () => { stateCallback = null }
        }),
        classify: vi.fn(() => Promise.resolve({
          intentType: 'filter',
          confidence: 0.85,
          entities: [],
          isMultiStep: false,
        })),
        planMacro: vi.fn(() => Promise.resolve({ steps: [], originalText: '', truncated: false })),
        dispose: vi.fn(),
        // Test helpers (exposed for test manipulation)
        _setMockState: (s: string) => { mockState = s },
        _triggerStateChange: (s: string) => {
          mockState = s
          if (stateCallback) stateCallback(s)
        },
      }
    }),
  }
})

// Mock the hybrid router
vi.mock('@/ai/nlp/hybridRouter', () => ({
  createHybridRouter: vi.fn((_nlpClient, _regexParser, _llmClassifier, _config) => ({
    route: vi.fn((text: string, _ctx: WorkbookContext) => {
      return Promise.resolve({
        intent: {
          intentType: 'filter',
          targetColumns: [],
          filters: {},
          parameters: {},
          rawQuery: text,
          confidence: 0.85,
          routingSource: 'nlp' as const,
        },
        source: 'nlp' as const,
        confidence: 0.85,
        latencyMs: 42,
      })
    }),
  })),
}))

// Get mocked modules for test manipulation
import { createNLPEngineClient } from '@/ai/nlp/nlpEngineClient'
import { createHybridRouter } from '@/ai/nlp/hybridRouter'

// ─── Test Config ────────────────────────────────────────────────────────────

const testConfig: NLPConfig = {
  modelBaseUrl: '/models/nlp/',
  bundledModelVersion: '1.0.0',
  fallbackThreshold: 0.6,
  initTimeoutMs: 10_000,
  maxRetries: 1,
  maxMacroSteps: 5,
  inferenceTimeoutMs: 500,
}

const mockLlmClassifier = vi.fn(async (text: string): Promise<UserIntent> => ({
  intentType: 'analyze',
  targetColumns: [],
  filters: {},
  parameters: {},
  rawQuery: text,
  confidence: 0.7,
  routingSource: 'llm',
}))

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Intent Parser Facade', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetForTesting()
    vi.clearAllMocks()
  })

  afterEach(() => {
    _resetForTesting()
    vi.useRealTimers()
  })

  // ─── Synchronous API (parseUserIntent) ────────────────────────────────

  describe('parseUserIntent (synchronous)', () => {
    it('returns a UserIntent with regex routingSource', () => {
      const intent = parseUserIntent('Show top 5 expenses')
      expect(intent.routingSource).toBe('regex')
      expect(intent.intentType).toBe('filter')
      expect(intent.rawQuery).toBe('Show top 5 expenses')
    })

    it('always uses regex regardless of NLP engine state', () => {
      // Initialize NLP engine
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      // Even after initialization, sync parseUserIntent uses regex
      const intent = parseUserIntent('Sort column B descending')
      expect(intent.routingSource).toBe('regex')
      expect(intent.intentType).toBe('sort')

      cleanup()
    })

    it('maintains identical signature (string → UserIntent)', () => {
      const result = parseUserIntent('hello world')
      expect(result).toHaveProperty('intentType')
      expect(result).toHaveProperty('targetColumns')
      expect(result).toHaveProperty('filters')
      expect(result).toHaveProperty('parameters')
      expect(result).toHaveProperty('rawQuery')
      expect(result).toHaveProperty('confidence')
      // Result is synchronous (not a promise)
      expect(result).not.toBeInstanceOf(Promise)
    })
  })

  // ─── isQueryIntent signature ──────────────────────────────────────────

  describe('isQueryIntent', () => {
    it('returns true for filter intents', () => {
      const intent = parseUserIntent('filter rows over $500')
      expect(isQueryIntent(intent)).toBe(true)
    })

    it('returns false for non-query intents', () => {
      const intent = parseUserIntent('format column A bold')
      expect(isQueryIntent(intent)).toBe(false)
    })
  })

  // ─── Async API (parseUserIntentAsync) ─────────────────────────────────

  describe('parseUserIntentAsync', () => {
    it('uses regex when NLP is not initialized', async () => {
      const result = await parseUserIntentAsync('Show top 5')
      expect(result.routingSource).toBe('regex')
    })

    it('uses regex when NLP state is loading (Req 4.3)', async () => {
      // Initialize but don't trigger ready state
      initializeNLPEngine(testConfig, mockLlmClassifier)
      // State is 'loading' by default

      const result = await parseUserIntentAsync('Show top 5')
      expect(result.routingSource).toBe('regex')
    })

    it('uses NLP when engine state is ready (Req 4.2)', async () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      // Simulate engine becoming ready
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      const result = await parseUserIntentAsync('Show top 5')
      expect(result.routingSource).toBe('nlp')
      expect(result.confidence).toBe(0.85)

      cleanup()
    })

    it('falls back to regex on NLP error within 2s (Req 4.5)', async () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      // Simulate engine becoming ready
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      // Make the router throw an error
      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      mockRouter.route.mockRejectedValueOnce(new Error('NLP inference failed'))

      const result = await parseUserIntentAsync('Sort column A')
      expect(result.routingSource).toBe('regex')
      expect(result.intentType).toBe('sort')

      cleanup()
    })

    it('falls back to regex on timeout (Req 4.5)', async () => {
      vi.useRealTimers() // Need real timers for this timeout test

      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      // Simulate engine becoming ready
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      // Make the router hang for more than 2 seconds
      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      mockRouter.route.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 3000))
      )

      const start = Date.now()
      const result = await parseUserIntentAsync('Analyze data')
      const elapsed = Date.now() - start

      // Should fall back within ~2 seconds
      expect(elapsed).toBeLessThan(2500)
      expect(result.routingSource).toBe('regex')

      cleanup()
    })

    it('never throws, always returns a valid UserIntent', async () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      // Make router throw
      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      mockRouter.route.mockRejectedValueOnce(new Error('catastrophic failure'))

      // Should not throw
      const result = await parseUserIntentAsync('anything')
      expect(result).toHaveProperty('intentType')
      expect(result).toHaveProperty('rawQuery')
      expect(result).toHaveProperty('confidence')

      cleanup()
    })

    it('passes workbook context to the router', async () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      const ctx: WorkbookContext = {
        activeSheetId: 'sheet-1',
        sheets: [{ id: 'sheet-1', name: 'Expenses', columns: [{ letter: 'A', headerName: 'Amount', index: 0 }] }],
      }

      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      await parseUserIntentAsync('Show top 5', ctx)

      expect(mockRouter.route).toHaveBeenCalledWith('Show top 5', ctx)

      cleanup()
    })

    it('provides empty workbook context when none given', async () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      await parseUserIntentAsync('Sort column A')

      expect(mockRouter.route).toHaveBeenCalledWith(
        'Sort column A',
        { activeSheetId: '', sheets: [] },
      )

      cleanup()
    })
  })

  // ─── In-flight request handling (Req 4.6) ─────────────────────────────

  describe('in-flight request handling during state transitions', () => {
    it('does not drop requests when state transitions mid-flight (Req 4.6)', async () => {
      vi.useRealTimers()

      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value

      // Start in ready state
      mockClient._triggerStateChange('ready')

      // Make the router resolve after a small delay
      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      mockRouter.route.mockImplementationOnce(async (text: string) => {
        // Simulate a small delay
        await new Promise(r => setTimeout(r, 50))
        return {
          intent: {
            intentType: 'filter',
            targetColumns: [],
            filters: {},
            parameters: {},
            rawQuery: text,
            confidence: 0.9,
            routingSource: 'nlp' as const,
          },
          source: 'nlp' as const,
          confidence: 0.9,
          latencyMs: 50,
        }
      })

      // Fire request while NLP is ready
      const promise = parseUserIntentAsync('Show top 5')

      // Transition to fallback mid-flight
      mockClient._triggerStateChange('fallback')

      // The in-flight request should still complete (not be dropped)
      const result = await promise
      expect(result).toHaveProperty('intentType')
      expect(result.routingSource).toBe('nlp')

      cleanup()
    })

    it('tracks in-flight count correctly', async () => {
      vi.useRealTimers()

      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      const mockRouter = (createHybridRouter as ReturnType<typeof vi.fn>).mock.results[0].value
      let resolveRoute: (value: unknown) => void
      mockRouter.route.mockImplementationOnce(() => new Promise(r => { resolveRoute = r }))

      expect(getInFlightCount()).toBe(0)
      const promise = parseUserIntentAsync('test')
      expect(getInFlightCount()).toBe(1)

      // Resolve the route
      resolveRoute!({
        intent: { intentType: 'unknown', targetColumns: [], filters: {}, parameters: {}, rawQuery: 'test', confidence: 0.5, routingSource: 'nlp' },
        source: 'nlp',
        confidence: 0.5,
        latencyMs: 10,
      })

      await promise
      expect(getInFlightCount()).toBe(0)

      cleanup()
    })
  })

  // ─── NLP Engine Lifecycle ─────────────────────────────────────────────

  describe('NLP engine lifecycle', () => {
    it('logs warning if NLP not ready within 30 seconds (Req 4.7)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)

      // Advance 30 seconds
      vi.advanceTimersByTime(30_000)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('NLP engine has not reached ready state within 30 seconds'),
      )

      warnSpy.mockRestore()
      cleanup()
    })

    it('does NOT log warning if NLP reaches ready before 30s', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value

      // Engine becomes ready after 5 seconds
      vi.advanceTimersByTime(5_000)
      mockClient._triggerStateChange('ready')

      // Advance past 30 seconds
      vi.advanceTimersByTime(30_000)

      // Warning should not have been called (only the info log for state transition)
      const warningCalls = warnSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('30 seconds')
      )
      expect(warningCalls).toHaveLength(0)

      warnSpy.mockRestore()
      cleanup()
    })

    it('reports loading state when not initialized', () => {
      expect(getNLPEngineState()).toBe('loading')
      expect(isNLPReady()).toBe(false)
    })

    it('reports ready state after engine is ready', () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)
      const mockClient = (createNLPEngineClient as ReturnType<typeof vi.fn>).mock.results[0].value
      mockClient._triggerStateChange('ready')

      expect(getNLPEngineState()).toBe('ready')
      expect(isNLPReady()).toBe(true)

      cleanup()
    })

    it('prevents double initialization', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const cleanup1 = initializeNLPEngine(testConfig, mockLlmClassifier)
      const cleanup2 = initializeNLPEngine(testConfig, mockLlmClassifier)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('NLP engine already initialized'),
      )

      warnSpy.mockRestore()
      cleanup1()
      cleanup2()
    })

    it('cleanup function disposes the engine', () => {
      const cleanup = initializeNLPEngine(testConfig, mockLlmClassifier)
      expect(getNLPEngineState()).toBe('loading')

      cleanup()
      expect(getNLPEngineState()).toBe('loading')
      expect(isNLPReady()).toBe(false)
    })
  })

  // ─── Re-exported Functions ────────────────────────────────────────────

  describe('re-exported functions maintain signatures', () => {
    it('serializeIntent produces JSON string', () => {
      const intent: UserIntent = {
        intentType: 'filter',
        targetColumns: ['A'],
        filters: {},
        parameters: {},
        rawQuery: 'test',
        confidence: 0.8,
      }
      const json = serializeIntent(intent)
      expect(typeof json).toBe('string')
      expect(JSON.parse(json)).toHaveProperty('intentType', 'filter')
    })

    it('deserializeIntent parses valid JSON', () => {
      const json = JSON.stringify({
        intentType: 'filter',
        targetColumns: ['A'],
        filters: {},
        parameters: {},
        rawQuery: 'test',
        confidence: 0.8,
      })
      const result = deserializeIntent(json)
      expect('success' in result).toBe(false) // Not an error
      expect((result as UserIntent).intentType).toBe('filter')
    })
  })
})
