/**
 * NLP Engine Service
 *
 * High-level singleton that manages the MiniLM embedding engine lifecycle
 * and provides semantic intent classification to the pipeline.
 *
 * Responsibilities:
 * - Lazy initialization of NLPWorkerBridge (on first classify call)
 * - Cosine similarity matching of embeddings against intent reference vectors
 * - Fallback to keyword classifier when engine is unavailable or confidence < threshold
 * - Caching of recent embeddings to avoid re-inference for repeated inputs
 * - Entity extraction delegation to the existing entityExtractor module
 */

import type { IntentType } from '@shared/intentTypes'
import type { ClassificationResult, NLPEngineState, WorkbookContext } from './types'
import { NLPWorkerBridge, type NLPBridgeOptions } from './nlpBridge'
import { INTENT_EMBEDDINGS, bootstrapIntentEmbeddings, isBootstrapped, loadPrecomputedEmbeddings } from './intentEmbeddings'
import { classifyIntent as classifyIntentKeyword } from './intentClassifier'
import { extractEntities } from './entityExtractor'
import { getCachedEmbedding, setCachedEmbedding, getCachedBootstrap, setCachedBootstrap } from './embeddingCache'

// ─── Configuration ──────────────────────────────────────────────────────────

/** Minimum cosine similarity to accept an NLP classification. Below this → fallback. */
const CONFIDENCE_THRESHOLD = 0.45

/** Second-best must be this much lower than best to avoid ambiguity */
const AMBIGUITY_GAP = 0.08

/** Maximum entries in the embedding cache */
const EMBEDDING_CACHE_SIZE = 64

/** Model base URL for public assets */
const DEFAULT_MODEL_URL = '/models/minilm/'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NLPClassifyOptions {
  /** Workbook context for entity resolution */
  workbookContext?: WorkbookContext
  /** Skip NLP engine and use keyword classifier directly */
  forceKeyword?: boolean
}

export interface NLPEngineStatus {
  state: NLPEngineState
  pendingRequests: number
  cacheSize: number
  initialized: boolean
}

// ─── Embedding Cache ────────────────────────────────────────────────────────

interface CacheEntry {
  embedding: Float32Array
  timestamp: number
}

class EmbeddingCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(text: string): Float32Array | null {
    const entry = this.cache.get(text)
    if (entry) {
      entry.timestamp = Date.now()
      return entry.embedding
    }
    return null
  }

  set(text: string, embedding: Float32Array): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      let oldestKey = ''
      let oldestTime = Infinity
      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp
          oldestKey = key
        }
      }
      if (oldestKey) this.cache.delete(oldestKey)
    }

    this.cache.set(text, { embedding, timestamp: Date.now() })
  }

  get size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
  }
}

// ─── NLP Engine ─────────────────────────────────────────────────────────────

export class NLPEngine {
  private bridge: NLPWorkerBridge | null = null
  private cache = new EmbeddingCache(EMBEDDING_CACHE_SIZE)
  private initStarted = false
  private bridgeOptions: NLPBridgeOptions
  private stateListeners: Array<(state: NLPEngineState) => void> = []

  constructor(options?: NLPBridgeOptions) {
    this.bridgeOptions = {
      modelBaseUrl: options?.modelBaseUrl ?? DEFAULT_MODEL_URL,
      inferenceTimeoutMs: options?.inferenceTimeoutMs ?? 500,
      initTimeoutMs: options?.initTimeoutMs ?? 10_000,
      onStateChange: (state) => {
        for (const listener of this.stateListeners) {
          listener(state)
        }
      },
    }
  }

  /** Current engine state */
  get state(): NLPEngineState {
    return this.bridge?.engineState ?? 'loading'
  }

  /** Whether the engine is ready for semantic classification */
  get isReady(): boolean {
    return this.bridge?.isReady ?? false
  }

  /** Engine status for observability */
  get status(): NLPEngineStatus {
    return {
      state: this.state,
      pendingRequests: this.bridge?.pendingCount ?? 0,
      cacheSize: this.cache.size,
      initialized: this.initStarted,
    }
  }

  /**
   * Subscribe to engine state changes.
   * Returns an unsubscribe function.
   */
  onStateChange(listener: (state: NLPEngineState) => void): () => void {
    this.stateListeners.push(listener)
    return () => {
      this.stateListeners = this.stateListeners.filter((l) => l !== listener)
    }
  }

  /**
   * Start engine initialization (non-blocking).
   * Safe to call multiple times. Does not throw — failures transition to 'fallback' state.
   * After the bridge reaches 'ready', automatically bootstraps intent embeddings.
   */
  startInit(): void {
    if (this.initStarted) return
    this.initStarted = true

    // Fast path: try loading pre-computed embeddings (no worker needed for this)
    loadPrecomputedEmbeddings().then((loaded) => {
      if (loaded) {
        // Pre-computed vectors loaded — still init the worker for user query embeddings
        console.info('[NLP] Pre-computed intent vectors loaded (instant bootstrap)')
      }
    }).catch(() => {
      // Non-fatal — will fall back to runtime bootstrap
    })

    this.bridge = new NLPWorkerBridge(this.bridgeOptions)
    this.bridge.initialize()
      .then(() => this.runBootstrap())
      .catch(() => {
        // Initialization failure is non-fatal — engine enters fallback state
        // and classify() will use the keyword classifier
      })
  }

  /**
   * Bootstrap intent embeddings after engine becomes ready.
   * Skips if pre-computed vectors were already loaded from intent-vectors.bin.
   * Falls back to computing MiniLM embeddings for all reference phrases.
   * Caches the result in IndexedDB for instant load next session.
   */
  private async runBootstrap(): Promise<void> {
    if (isBootstrapped() || !this.bridge?.isReady) return

    // Try loading from IndexedDB cache (faster than runtime computation)
    const cached = await getCachedBootstrap('minilm-v1')
    if (cached && cached.length > 0) {
      const { bootstrapFromCache } = await import('./intentEmbeddings')
      bootstrapFromCache(cached)
      return
    }

    try {
      await bootstrapIntentEmbeddings(async (text: string) => {
        const result = await this.bridge!.embed(text)
        return result.rawEmbedding ?? null
      })

      // Cache the computed vectors in IndexedDB for next session
      const { INTENT_EMBEDDINGS: embeddings } = await import('./intentEmbeddings')
      const toCache = embeddings.map((e) => ({ name: e.intentType, embedding: e.embedding }))
      setCachedBootstrap('minilm-v1', toCache)
    } catch {
      // Bootstrap failure is non-fatal — engine stays in 'ready' state
      // but classify will fall back to keyword since isBootstrapped() = false
    }
  }

  /**
   * Classify user input into an intent using semantic embeddings.
   *
   * Pipeline:
   * 1. If engine not ready or forceKeyword → use keyword classifier
   * 2. Check embedding cache → reuse if available
   * 3. Compute embedding via NLP worker
   * 4. Match against intent reference embeddings via cosine similarity
   * 5. If confidence < threshold or ambiguous → fall back to keyword classifier
   * 6. Extract entities using workbook context
   * 7. Return ClassificationResult with routing source 'nlp'
   *
   * Always returns a result — never throws. Falls back gracefully on any error.
   */
  async classify(
    text: string,
    options?: NLPClassifyOptions,
  ): Promise<ClassificationResult> {
    // Fast path: force keyword or engine not ready
    if (options?.forceKeyword || !this.isReady) {
      return this.classifyWithKeyword(text, options?.workbookContext)
    }

    try {
      // Normalize for cache lookup
      const normalizedText = text.trim().toLowerCase()
      if (normalizedText.length === 0) {
        return {
          intentType: 'unknown',
          confidence: 0,
          entities: [],
          isMultiStep: false,
        }
      }

      // Check in-memory cache
      let embedding = this.cache.get(normalizedText)

      if (!embedding) {
        // Check IndexedDB persistent cache
        embedding = await getCachedEmbedding(normalizedText)
        if (embedding) {
          this.cache.set(normalizedText, embedding)
        }
      }

      if (!embedding) {
        // Compute embedding via worker
        const result = await this.bridge!.embed(text)
        embedding = result.rawEmbedding ?? null

        if (!embedding) {
          // Worker returned no embedding — fall back
          return this.classifyWithKeyword(text, options?.workbookContext)
        }

        // Cache the embedding (memory + IndexedDB)
        this.cache.set(normalizedText, embedding)
        setCachedEmbedding(normalizedText, embedding) // fire-and-forget
      }

      // Match against intent reference embeddings
      const match = this.matchIntent(embedding)

      if (!match || match.confidence < CONFIDENCE_THRESHOLD) {
        // Below threshold — use keyword classifier but enrich with embedding
        const keywordResult = this.classifyWithKeyword(text, options?.workbookContext)
        keywordResult.rawEmbedding = embedding
        return keywordResult
      }

      // Extract entities for the classified intent
      const entities = options?.workbookContext
        ? extractEntities(text, match.intentType, options.workbookContext)
        : []

      // Detect multi-step (heuristic: multiple action verbs or conjunctions)
      const isMultiStep = detectMultiStep(text)

      return {
        intentType: match.intentType,
        confidence: match.confidence,
        entities,
        isMultiStep,
        rawEmbedding: embedding,
      }
    } catch {
      // Any error → graceful fallback to keyword classifier
      return this.classifyWithKeyword(text, options?.workbookContext)
    }
  }

  /**
   * Dispose the engine and release all resources.
   */
  dispose(): void {
    this.bridge?.terminate()
    this.bridge = null
    this.cache.clear()
    this.stateListeners = []
    this.initStarted = false
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Match an embedding against all intent reference embeddings.
   * Returns the best match with confidence, or null if no good match found.
   */
  private matchIntent(
    embedding: Float32Array,
  ): { intentType: IntentType; confidence: number } | null {
    let bestIntent: IntentType = 'unknown'
    let bestScore = -1
    let secondBestScore = -1

    for (const entry of INTENT_EMBEDDINGS) {
      const score = cosineSimilarity(embedding, entry.embedding)

      if (score > bestScore) {
        secondBestScore = bestScore
        bestScore = score
        bestIntent = entry.intentType
      } else if (score > secondBestScore) {
        secondBestScore = score
      }
    }

    // Reject if ambiguous (top two scores too close)
    if (bestScore - secondBestScore < AMBIGUITY_GAP && bestScore < 0.7) {
      return null
    }

    // Normalize confidence to [0, 1]
    const confidence = Math.round(Math.max(0, Math.min(1, bestScore)) * 100) / 100

    return { intentType: bestIntent, confidence }
  }

  /**
   * Fallback classification using the existing keyword+trigram classifier.
   */
  private classifyWithKeyword(
    text: string,
    workbookContext?: WorkbookContext,
  ): ClassificationResult {
    return classifyIntentKeyword(text, workbookContext)
  }
}

// ─── Cosine Similarity ──────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors.
 * Both vectors are assumed to be L2-normalized (from the worker),
 * so cosine similarity simplifies to dot product.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length)
  let dot = 0
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
  }
  return dot
}

// ─── Multi-Step Detection ───────────────────────────────────────────────────

/** Heuristic: detect if input contains multiple action clauses */
function detectMultiStep(text: string): boolean {
  const multiStepPatterns = [
    /\b(then|after that|next|also|and then)\b/i,
    /\b(first|second|third)\b.*\b(then|next|after)\b/i,
    /;/,
    /\d+\.\s/,
  ]
  return multiStepPatterns.some((p) => p.test(text))
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let _instance: NLPEngine | null = null

/**
 * Get the global NLP engine singleton.
 * Creates the instance on first call but does NOT start initialization.
 * Call engine.startInit() explicitly when the app is ready.
 */
export function getNLPEngine(): NLPEngine {
  if (!_instance) {
    _instance = new NLPEngine()
  }
  return _instance
}

/**
 * Replace the global NLP engine (for testing).
 */
export function setNLPEngine(engine: NLPEngine | null): void {
  _instance?.dispose()
  _instance = engine
}
