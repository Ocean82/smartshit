/**
 * NLP Engine Client — Main-thread facade
 *
 * Manages the NLP Web Worker lifecycle and provides a Promise-based API
 * for classification and macro planning. Handles:
 * - Worker creation and communication
 * - Request ID tracking with pending promise maps
 * - 500ms inference timeout with cancellation
 * - Worker crash recovery (onerror → fallback state, recreate worker)
 * - State change callback registration
 *
 * @module nlpEngineClient
 */

import type {
  NLPEngineState,
  NLPConfig,
  NLPWorkerRequest,
  NLPWorkerResponse,
  ClassificationResult,
  MacroPlan,
  WorkbookContext,
  NLPError,
} from './types'

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface NLPEngineClient {
  readonly state: NLPEngineState
  onStateChange: (cb: (state: NLPEngineState) => void) => () => void
  classify(text: string, ctx: WorkbookContext): Promise<ClassificationResult>
  planMacro(text: string, ctx: WorkbookContext): Promise<MacroPlan>
  dispose(): void
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface PendingRequest<T> {
  resolve: (value: T) => void
  reject: (reason: NLPError) => void
  timeoutId: ReturnType<typeof setTimeout>
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates an NLPEngineClient that manages a Web Worker running the NLP inference pipeline.
 *
 * @param config - NLP configuration (model URL, timeouts, etc.)
 * @returns An NLPEngineClient instance
 */
export function createNLPEngineClient(config: NLPConfig): NLPEngineClient {
  let currentState: NLPEngineState = 'loading'
  const stateChangeCallbacks = new Set<(state: NLPEngineState) => void>()
  const pendingRequests = new Map<string, PendingRequest<unknown>>()
  let requestCounter = 0
  let disposed = false
  let worker: Worker | null = null

  // ─── Worker Lifecycle ───────────────────────────────────────────────

  function createWorker(): Worker {
    const w = new Worker(
      new URL('./nlpWorker.ts', import.meta.url),
      { type: 'module' }
    )

    w.onmessage = handleWorkerMessage
    w.onerror = handleWorkerError

    // Send init message to start model loading
    const initMessage: NLPWorkerRequest = {
      type: 'init',
      modelUrl: `${config.modelBaseUrl}v${config.bundledModelVersion}/model.wasm`,
      checksum: '', // Checksum will be validated by the worker/model manager
    }
    w.postMessage(initMessage)

    return w
  }

  function handleWorkerMessage(event: MessageEvent<NLPWorkerResponse>): void {
    if (disposed) return

    const message = event.data

    switch (message.type) {
      case 'stateChange':
        updateState(message.state)
        break

      case 'classifyResult': {
        const pending = pendingRequests.get(message.id)
        if (pending) {
          clearTimeout(pending.timeoutId)
          pendingRequests.delete(message.id)
          pending.resolve(message.result)
        }
        break
      }

      case 'planResult': {
        const pending = pendingRequests.get(message.id)
        if (pending) {
          clearTimeout(pending.timeoutId)
          pendingRequests.delete(message.id)
          pending.resolve(message.result)
        }
        break
      }

      case 'error': {
        const pending = pendingRequests.get(message.id)
        if (pending) {
          clearTimeout(pending.timeoutId)
          pendingRequests.delete(message.id)
          pending.reject({
            code: 'INFERENCE_TIMEOUT',
            message: message.error,
          })
        }
        break
      }
    }
  }

  function handleWorkerError(_event: Event): void {
    if (disposed) return

    // Reset to fallback state
    updateState('fallback')

    // Reject all pending requests
    rejectAllPending({
      code: 'WORKER_CRASH',
      message: 'NLP worker crashed unexpectedly',
    })

    // Recreate the worker
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      try {
        worker.terminate()
      } catch {
        // Worker may already be dead
      }
    }
    worker = createWorker()
  }

  // ─── State Management ─────────────────────────────────────────────

  function updateState(newState: NLPEngineState): void {
    currentState = newState
    for (const cb of stateChangeCallbacks) {
      try {
        cb(newState)
      } catch {
        // Don't let callback errors crash the client
      }
    }
  }

  // ─── Request Tracking ─────────────────────────────────────────────

  function generateRequestId(): string {
    return `req_${++requestCounter}_${Date.now()}`
  }

  function rejectAllPending(error: NLPError): void {
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
      pendingRequests.delete(id)
    }
  }

  // ─── Initialize Worker ────────────────────────────────────────────

  worker = createWorker()

  // ─── Public API ───────────────────────────────────────────────────

  const client: NLPEngineClient = {
    get state(): NLPEngineState {
      return currentState
    },

    onStateChange(cb: (state: NLPEngineState) => void): () => void {
      stateChangeCallbacks.add(cb)
      return () => {
        stateChangeCallbacks.delete(cb)
      }
    },

    classify(text: string, ctx: WorkbookContext): Promise<ClassificationResult> {
      if (disposed) {
        return Promise.reject({
          code: 'WORKER_CRASH',
          message: 'NLP engine client has been disposed',
        } satisfies NLPError)
      }

      const id = generateRequestId()
      const timeoutMs = config.inferenceTimeoutMs

      return new Promise<ClassificationResult>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(id)

          // Send cancel message to worker
          if (worker) {
            const cancelMessage: NLPWorkerRequest = { type: 'cancel', id }
            worker.postMessage(cancelMessage)
          }

          reject({
            code: 'INFERENCE_TIMEOUT',
            message: `Classification timed out after ${timeoutMs}ms`,
          } satisfies NLPError)
        }, timeoutMs)

        pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timeoutId,
        })

        const message: NLPWorkerRequest = {
          type: 'classify',
          id,
          text,
          workbookContext: ctx,
        }
        worker!.postMessage(message)
      })
    },

    planMacro(text: string, ctx: WorkbookContext): Promise<MacroPlan> {
      if (disposed) {
        return Promise.reject({
          code: 'WORKER_CRASH',
          message: 'NLP engine client has been disposed',
        } satisfies NLPError)
      }

      const id = generateRequestId()
      const timeoutMs = config.inferenceTimeoutMs

      return new Promise<MacroPlan>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          pendingRequests.delete(id)

          // Send cancel message to worker
          if (worker) {
            const cancelMessage: NLPWorkerRequest = { type: 'cancel', id }
            worker.postMessage(cancelMessage)
          }

          reject({
            code: 'INFERENCE_TIMEOUT',
            message: `Macro planning timed out after ${timeoutMs}ms`,
          } satisfies NLPError)
        }, timeoutMs)

        pendingRequests.set(id, {
          resolve: resolve as (value: unknown) => void,
          reject,
          timeoutId,
        })

        const message: NLPWorkerRequest = {
          type: 'planMacro',
          id,
          text,
          workbookContext: ctx,
        }
        worker!.postMessage(message)
      })
    },

    dispose(): void {
      if (disposed) return
      disposed = true

      // Reject all pending requests
      rejectAllPending({
        code: 'WORKER_CRASH',
        message: 'NLP engine client disposed',
      })

      // Terminate the worker
      if (worker) {
        worker.onmessage = null
        worker.onerror = null
        worker.terminate()
        worker = null
      }

      // Clear callbacks
      stateChangeCallbacks.clear()
    },
  }

  return client
}
