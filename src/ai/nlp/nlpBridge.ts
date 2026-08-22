/**
 * NLP Worker Bridge
 *
 * Main thread ↔ NLP Web Worker messaging API. Manages the worker lifecycle,
 * request/response correlation, initialization timeout, and graceful fallback.
 *
 * Follows the same patterns as OnnxWorkerBridge:
 * - Lazy worker creation (won't block app startup)
 * - Request correlation via unique IDs
 * - Timeout enforcement (per NLPConfig.inferenceTimeoutMs)
 * - State machine tracking (loading → ready → fallback)
 * - Graceful degradation: if worker fails, engine falls back to keyword classifier
 */

import type {
  NLPWorkerRequest,
  NLPWorkerResponse,
  NLPEngineState,
  NLPConfig,
  ClassificationResult,
} from './types'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default inference timeout (ms) */
const DEFAULT_INFERENCE_TIMEOUT_MS = 500

/** Default initialization timeout (ms) */
const DEFAULT_INIT_TIMEOUT_MS = 10_000

/** Maximum pending requests before rejecting */
const MAX_PENDING_REQUESTS = 20

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (result: ClassificationResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface NLPBridgeOptions {
  /** Base URL for model assets. Default: '/models/minilm/' */
  modelBaseUrl?: string
  /** Inference timeout in ms. Default: 500 */
  inferenceTimeoutMs?: number
  /** Init timeout in ms. Default: 10_000 */
  initTimeoutMs?: number
  /** Callback when engine state changes */
  onStateChange?: (state: NLPEngineState) => void
}

// ─── Bridge Class ───────────────────────────────────────────────────────────

export class NLPWorkerBridge {
  private worker: Worker | null = null
  private state: NLPEngineState = 'loading'
  private pending: Map<string, PendingRequest> = new Map()
  private initPromise: Promise<void> | null = null
  private initResolve: (() => void) | null = null
  private initReject: ((err: Error) => void) | null = null
  private terminated = false
  private requestCounter = 0

  private modelBaseUrl: string
  private inferenceTimeoutMs: number
  private initTimeoutMs: number
  private onStateChange?: (state: NLPEngineState) => void

  constructor(options?: NLPBridgeOptions) {
    this.modelBaseUrl = options?.modelBaseUrl ?? '/models/minilm/'
    this.inferenceTimeoutMs = options?.inferenceTimeoutMs ?? DEFAULT_INFERENCE_TIMEOUT_MS
    this.initTimeoutMs = options?.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS
    this.onStateChange = options?.onStateChange
  }

  /** Current engine state */
  get engineState(): NLPEngineState {
    return this.state
  }

  /** Whether the engine is ready for inference */
  get isReady(): boolean {
    return this.state === 'ready'
  }

  /** Whether the engine has fallen back to keyword mode */
  get isFallback(): boolean {
    return this.state === 'fallback'
  }

  /**
   * Initialize the NLP worker and load the model.
   * Returns a promise that resolves when the engine is ready,
   * or rejects if initialization fails/times out.
   *
   * Safe to call multiple times — returns the same promise if already initializing.
   */
  async initialize(): Promise<void> {
    if (this.terminated) {
      throw new Error('NLP bridge has been terminated')
    }

    if (this.state === 'ready') return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.initResolve = resolve
      this.initReject = reject
    })

    // Create worker
    this.worker = new Worker(
      new URL('./nlp.worker.ts', import.meta.url),
      { type: 'module' }
    )
    this.worker.onmessage = this.handleMessage.bind(this)
    this.worker.onerror = this.handleError.bind(this)

    // Send init message
    const initMsg: NLPWorkerRequest = {
      type: 'init',
      modelUrl: this.modelBaseUrl,
      checksum: '', // Checksum validation deferred — model served by same origin
    }
    this.worker.postMessage(initMsg)

    // Init timeout
    const initTimer = setTimeout(() => {
      if (this.state !== 'ready') {
        this.transitionState('fallback')
        this.initReject?.(new Error(`NLP engine initialization timed out after ${this.initTimeoutMs}ms`))
        this.initResolve = null
        this.initReject = null
      }
    }, this.initTimeoutMs)

    // Clear timeout on resolution
    this.initPromise.then(() => clearTimeout(initTimer)).catch(() => clearTimeout(initTimer))

    return this.initPromise
  }

  /**
   * Compute a sentence embedding for the given text.
   * Returns a ClassificationResult with rawEmbedding populated.
   *
   * @throws if engine is not ready, terminated, or request times out
   */
  async embed(text: string): Promise<ClassificationResult> {
    if (this.terminated) {
      throw new Error('NLP bridge has been terminated')
    }

    if (this.state !== 'ready') {
      throw new Error(`NLP engine is not ready (state: ${this.state})`)
    }

    if (this.pending.size >= MAX_PENDING_REQUESTS) {
      throw new Error('NLP inference queue is full')
    }

    const id = this.nextId()

    return new Promise<ClassificationResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`NLP inference timed out after ${this.inferenceTimeoutMs}ms`))
      }, this.inferenceTimeoutMs)

      this.pending.set(id, { resolve, reject, timer })

      const msg: NLPWorkerRequest = {
        type: 'classify',
        id,
        text,
        workbookContext: { activeSheetId: '', sheets: [] }, // Context resolved on main thread
      }
      this.worker!.postMessage(msg)
    })
  }

  /**
   * Cancel a pending request. The worker will still run but the result is discarded.
   */
  cancel(id: string): void {
    const pending = this.pending.get(id)
    if (pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Request cancelled'))
      this.pending.delete(id)
    }
  }

  /**
   * Terminate the worker and reject all pending requests.
   */
  terminate(): void {
    if (this.terminated) return
    this.terminated = true

    // Reject all pending requests
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('NLP bridge terminated'))
      this.pending.delete(id)
    }

    // Reject init if still pending
    if (this.initReject) {
      this.initReject(new Error('NLP bridge terminated'))
      this.initResolve = null
      this.initReject = null
    }

    // Terminate worker
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }

    this.transitionState('fallback')
  }

  /**
   * Number of currently pending inference requests.
   */
  get pendingCount(): number {
    return this.pending.size
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private handleMessage(event: MessageEvent<NLPWorkerResponse>): void {
    const msg = event.data

    switch (msg.type) {
      case 'stateChange':
        this.transitionState(msg.state)
        if (msg.state === 'ready' && this.initResolve) {
          this.initResolve()
          this.initResolve = null
          this.initReject = null
        }
        if (msg.state === 'fallback' && this.initReject) {
          this.initReject(new Error('NLP engine entered fallback state'))
          this.initResolve = null
          this.initReject = null
        }
        break

      case 'classifyResult': {
        const pending = this.pending.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(msg.id)
          pending.resolve(msg.result)
        }
        break
      }

      case 'planResult': {
        // Plans reuse classify path — treated as classifyResult on bridge level
        const pending = this.pending.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(msg.id)
          // Return a minimal ClassificationResult (macro planning handled upstream)
          pending.resolve({
            intentType: 'unknown',
            confidence: 0,
            entities: [],
            isMultiStep: true,
          })
        }
        break
      }

      case 'error': {
        const pending = this.pending.get(msg.id)
        if (pending) {
          clearTimeout(pending.timer)
          this.pending.delete(msg.id)
          pending.reject(new Error(msg.error))
        }
        // If this is an init error, also reject init promise
        if (msg.id === '__init__' && this.initReject) {
          this.initReject(new Error(msg.error))
          this.initResolve = null
          this.initReject = null
        }
        break
      }
    }
  }

  private handleError(event: ErrorEvent): void {
    // Worker-level crash — transition to fallback
    this.transitionState('fallback')

    // Reject all pending
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`NLP Worker crashed: ${event.message}`))
    }
    this.pending.clear()

    // Reject init if pending
    if (this.initReject) {
      this.initReject(new Error(`NLP Worker crashed: ${event.message}`))
      this.initResolve = null
      this.initReject = null
    }
  }

  private transitionState(newState: NLPEngineState): void {
    if (this.state === newState) return
    this.state = newState
    this.onStateChange?.(newState)
  }

  private nextId(): string {
    return `nlp_${++this.requestCounter}_${Date.now()}`
  }
}
