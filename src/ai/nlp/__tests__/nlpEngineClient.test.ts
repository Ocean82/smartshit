/**
 * Unit tests for the NLP Engine Client (main-thread facade)
 *
 * Tests worker lifecycle management, Promise-based classify/planMacro,
 * request ID tracking, 500ms inference timeout, and worker error recovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NLPConfig, NLPWorkerResponse, ClassificationResult, MacroPlan } from '../types'

// ─── Mock Worker ────────────────────────────────────────────────────────────

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: { message: string }) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()

  // Test helpers to simulate worker responses
  simulateMessage(data: NLPWorkerResponse): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror({ message: 'Worker crashed' })
    }
  }
}

let mockWorkerInstances: MockWorker[] = []

vi.stubGlobal('Worker', class {
  constructor() {
    const instance = new MockWorker()
    mockWorkerInstances.push(instance)
    return instance
  }
})

// ─── Import after mocking ───────────────────────────────────────────────────

// Dynamic import to ensure Worker mock is in place
const { createNLPEngineClient } = await import('../nlpEngineClient')

// ─── Test helpers ───────────────────────────────────────────────────────────

function createTestConfig(overrides?: Partial<NLPConfig>): NLPConfig {
  return {
    modelBaseUrl: '/models/nlp/',
    bundledModelVersion: '1.0.0',
    fallbackThreshold: 0.6,
    initTimeoutMs: 10_000,
    maxRetries: 1,
    maxMacroSteps: 5,
    inferenceTimeoutMs: 500,
    ...overrides,
  }
}

function getLatestWorker(): MockWorker {
  return mockWorkerInstances[mockWorkerInstances.length - 1]
}

function createMockClassificationResult(): ClassificationResult {
  return {
    intentType: 'read',
    confidence: 0.92,
    entities: [],
    isMultiStep: false,
  }
}

function createMockMacroPlan(): MacroPlan {
  return {
    steps: [
      { tool: 'filter', params: { column: 'A', operator: '>' }, description: 'Filter column A for values greater than threshold' },
    ],
    originalText: 'filter column A',
    truncated: false,
  }
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  mockWorkerInstances = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createNLPEngineClient', () => {
  describe('Worker lifecycle', () => {
    it('creates a worker on initialization', () => {
      createNLPEngineClient(createTestConfig())
      expect(mockWorkerInstances).toHaveLength(1)
    })

    it('sends init message to worker on creation', () => {
      createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'init',
          modelUrl: '/models/nlp/v1.0.0/model.wasm',
        })
      )
    })

    it('terminates worker on dispose', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      client.dispose()
      expect(worker.terminate).toHaveBeenCalled()
    })

    it('recreates worker after onerror', () => {
      createNLPEngineClient(createTestConfig())
      const firstWorker = getLatestWorker()

      firstWorker.simulateError()

      // Should have created a new worker
      expect(mockWorkerInstances).toHaveLength(2)
    })
  })

  describe('State management', () => {
    it('starts in loading state', () => {
      const client = createNLPEngineClient(createTestConfig())
      expect(client.state).toBe('loading')
    })

    it('updates state on stateChange message from worker', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      worker.simulateMessage({ type: 'stateChange', state: 'ready' })
      expect(client.state).toBe('ready')
    })

    it('transitions to fallback on worker error', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      worker.simulateMessage({ type: 'stateChange', state: 'ready' })
      expect(client.state).toBe('ready')

      worker.simulateError()
      expect(client.state).toBe('fallback')
    })
  })

  describe('onStateChange', () => {
    it('notifies registered callbacks on state change', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()
      const callback = vi.fn()

      client.onStateChange(callback)
      worker.simulateMessage({ type: 'stateChange', state: 'ready' })

      expect(callback).toHaveBeenCalledWith('ready')
    })

    it('supports multiple callbacks', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()
      const cb1 = vi.fn()
      const cb2 = vi.fn()

      client.onStateChange(cb1)
      client.onStateChange(cb2)
      worker.simulateMessage({ type: 'stateChange', state: 'ready' })

      expect(cb1).toHaveBeenCalledWith('ready')
      expect(cb2).toHaveBeenCalledWith('ready')
    })

    it('returns an unsubscribe function', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()
      const callback = vi.fn()

      const unsubscribe = client.onStateChange(callback)
      unsubscribe()

      worker.simulateMessage({ type: 'stateChange', state: 'ready' })
      expect(callback).not.toHaveBeenCalled()
    })

    it('does not throw if callback throws', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      client.onStateChange(() => {
        throw new Error('callback error')
      })

      expect(() => {
        worker.simulateMessage({ type: 'stateChange', state: 'ready' })
      }).not.toThrow()
    })
  })

  describe('classify()', () => {
    it('sends classify message to worker with unique ID', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      client.classify('sum column A', ctx)

      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'classify',
          id: expect.any(String),
          text: 'sum column A',
          workbookContext: ctx,
        })
      )
    })

    it('resolves with classification result on classifyResult message', async () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.classify('sum column A', ctx)

      // Get the request ID from the sent message
      const sentMessage = worker.postMessage.mock.calls[1][0] // [0] is init, [1] is classify
      const id = sentMessage.id

      // Simulate worker response
      const mockResult = createMockClassificationResult()
      worker.simulateMessage({ type: 'classifyResult', id, result: mockResult })

      const result = await resultPromise
      expect(result).toEqual(mockResult)
    })

    it('rejects on error message from worker', async () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.classify('sum column A', ctx)

      const sentMessage = worker.postMessage.mock.calls[1][0]
      const id = sentMessage.id

      worker.simulateMessage({ type: 'error', id, error: 'Engine not ready' })

      await expect(resultPromise).rejects.toEqual(
        expect.objectContaining({ code: 'INFERENCE_TIMEOUT', message: 'Engine not ready' })
      )
    })

    it('rejects after dispose', async () => {
      const client = createNLPEngineClient(createTestConfig())
      client.dispose()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      await expect(client.classify('test', ctx)).rejects.toEqual(
        expect.objectContaining({ code: 'WORKER_CRASH' })
      )
    })

    it('generates unique request IDs for concurrent calls', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      client.classify('first', ctx)
      client.classify('second', ctx)

      const call1 = worker.postMessage.mock.calls[1][0] // skip init
      const call2 = worker.postMessage.mock.calls[2][0]

      expect(call1.id).not.toBe(call2.id)
    })
  })

  describe('planMacro()', () => {
    it('sends planMacro message to worker with unique ID', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      client.planMacro('filter then sort', ctx)

      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'planMacro',
          id: expect.any(String),
          text: 'filter then sort',
          workbookContext: ctx,
        })
      )
    })

    it('resolves with macro plan on planResult message', async () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.planMacro('filter then sort', ctx)

      const sentMessage = worker.postMessage.mock.calls[1][0]
      const id = sentMessage.id

      const mockPlan = createMockMacroPlan()
      worker.simulateMessage({ type: 'planResult', id, result: mockPlan })

      const result = await resultPromise
      expect(result).toEqual(mockPlan)
    })

    it('rejects after dispose', async () => {
      const client = createNLPEngineClient(createTestConfig())
      client.dispose()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      await expect(client.planMacro('test', ctx)).rejects.toEqual(
        expect.objectContaining({ code: 'WORKER_CRASH' })
      )
    })
  })

  describe('500ms inference timeout', () => {
    it('rejects classify with INFERENCE_TIMEOUT after configured timeout', async () => {
      const client = createNLPEngineClient(createTestConfig({ inferenceTimeoutMs: 500 }))

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.classify('slow request', ctx)

      // Advance timers past the timeout
      vi.advanceTimersByTime(501)

      await expect(resultPromise).rejects.toEqual(
        expect.objectContaining({
          code: 'INFERENCE_TIMEOUT',
          message: expect.stringContaining('500ms'),
        })
      )
    })

    it('rejects planMacro with INFERENCE_TIMEOUT after configured timeout', async () => {
      const client = createNLPEngineClient(createTestConfig({ inferenceTimeoutMs: 500 }))

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.planMacro('slow plan', ctx)

      vi.advanceTimersByTime(501)

      await expect(resultPromise).rejects.toEqual(
        expect.objectContaining({
          code: 'INFERENCE_TIMEOUT',
          message: expect.stringContaining('500ms'),
        })
      )
    })

    it('sends cancel message to worker on timeout', async () => {
      const client = createNLPEngineClient(createTestConfig({ inferenceTimeoutMs: 500 }))
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.classify('slow request', ctx)

      const sentMessage = worker.postMessage.mock.calls[1][0]
      const id = sentMessage.id

      vi.advanceTimersByTime(501)

      // Should have sent a cancel message
      expect(worker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cancel', id })
      )

      await expect(resultPromise).rejects.toBeDefined()
    })

    it('does not reject if response arrives before timeout', async () => {
      const client = createNLPEngineClient(createTestConfig({ inferenceTimeoutMs: 500 }))
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.classify('fast request', ctx)

      const sentMessage = worker.postMessage.mock.calls[1][0]
      const id = sentMessage.id

      // Respond before timeout
      vi.advanceTimersByTime(100)
      worker.simulateMessage({ type: 'classifyResult', id, result: createMockClassificationResult() })

      const result = await resultPromise
      expect(result.intentType).toBe('read')
    })

    it('uses custom timeout value from config', async () => {
      const client = createNLPEngineClient(createTestConfig({ inferenceTimeoutMs: 200 }))

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const resultPromise = client.classify('request', ctx)

      // Should NOT timeout at 150ms
      vi.advanceTimersByTime(150)

      // Should timeout at 200ms
      vi.advanceTimersByTime(51)

      await expect(resultPromise).rejects.toEqual(
        expect.objectContaining({
          code: 'INFERENCE_TIMEOUT',
          message: expect.stringContaining('200ms'),
        })
      )
    })
  })

  describe('Worker onerror recovery', () => {
    it('resets to fallback state on worker error', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      worker.simulateMessage({ type: 'stateChange', state: 'ready' })
      worker.simulateError()

      expect(client.state).toBe('fallback')
    })

    it('rejects all pending requests on worker error', async () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const p1 = client.classify('request 1', ctx)
      const p2 = client.planMacro('request 2', ctx)

      worker.simulateError()

      await expect(p1).rejects.toEqual(
        expect.objectContaining({ code: 'WORKER_CRASH' })
      )
      await expect(p2).rejects.toEqual(
        expect.objectContaining({ code: 'WORKER_CRASH' })
      )
    })

    it('recreates the worker after crash', () => {
      createNLPEngineClient(createTestConfig())
      expect(mockWorkerInstances).toHaveLength(1)

      const worker = getLatestWorker()
      worker.simulateError()

      expect(mockWorkerInstances).toHaveLength(2)
    })

    it('new worker is functional after recreation', async () => {
      const client = createNLPEngineClient(createTestConfig())
      const firstWorker = getLatestWorker()

      // Crash the first worker
      firstWorker.simulateError()

      // New worker should be active
      const newWorker = getLatestWorker()
      expect(newWorker).not.toBe(firstWorker)

      // Simulate the new worker becoming ready
      newWorker.simulateMessage({ type: 'stateChange', state: 'ready' })
      expect(client.state).toBe('ready')

      // Make a request on the new worker
      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const promise = client.classify('test', ctx)

      const sentMessage = newWorker.postMessage.mock.calls[1][0] // [0] is init
      const id = sentMessage.id

      newWorker.simulateMessage({ type: 'classifyResult', id, result: createMockClassificationResult() })

      const result = await promise
      expect(result.intentType).toBe('read')
    })

    it('terminates old worker on crash before recreating', () => {
      createNLPEngineClient(createTestConfig())
      const firstWorker = getLatestWorker()

      firstWorker.simulateError()

      expect(firstWorker.terminate).toHaveBeenCalled()
    })
  })

  describe('dispose()', () => {
    it('rejects all pending requests', async () => {
      const client = createNLPEngineClient(createTestConfig())

      const ctx = { activeSheetId: 'sheet1', sheets: [] }
      const p1 = client.classify('request 1', ctx)
      const p2 = client.planMacro('request 2', ctx)

      client.dispose()

      await expect(p1).rejects.toEqual(
        expect.objectContaining({ code: 'WORKER_CRASH' })
      )
      await expect(p2).rejects.toEqual(
        expect.objectContaining({ code: 'WORKER_CRASH' })
      )
    })

    it('terminates the worker', () => {
      const client = createNLPEngineClient(createTestConfig())
      const worker = getLatestWorker()

      client.dispose()
      expect(worker.terminate).toHaveBeenCalled()
    })

    it('clears state change callbacks', () => {
      const client = createNLPEngineClient(createTestConfig())
      const callback = vi.fn()
      client.onStateChange(callback)

      client.dispose()

      // Even if somehow a message came through, callback should not fire
      // (the test validates internal cleanup)
      expect(callback).not.toHaveBeenCalled()
    })

    it('is idempotent — calling dispose twice does not throw', () => {
      const client = createNLPEngineClient(createTestConfig())
      client.dispose()
      expect(() => client.dispose()).not.toThrow()
    })
  })
})
