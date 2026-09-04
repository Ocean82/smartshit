/**
 * Intent Embeddings — Reference Vectors for Semantic Classification
 *
 * Provides pre-defined representative phrases for each intent type.
 * On first engine initialization, these phrases are embedded via MiniLM
 * and the resulting vectors are cached as the reference set for cosine
 * similarity matching.
 *
 * Until bootstrap completes, the module exports placeholder zero vectors
 * so the engine falls back to the keyword classifier gracefully.
 *
 * Architecture:
 * - Each intent has 3–5 representative phrases (natural language, not keywords)
 * - After bootstrap, each intent is represented by the mean of its phrase embeddings
 * - The mean vectors are L2-normalized for efficient dot-product similarity
 */

import type { IntentType } from '@shared/intentTypes'
import { INTENT_PHRASES as SHARED_INTENT_PHRASES, intentPhrasesHash } from '@shared/intentPhrases.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface IntentEmbeddingEntry {
  intentType: IntentType
  embedding: Float32Array
  /** Representative phrases used to compute this embedding */
  phrases: string[]
}

// ─── Embedding Dimension ────────────────────────────────────────────────────

/** MiniLM hidden size / embedding dimension */
export const EMBEDDING_DIM = 384

// ─── Representative Phrases ─────────────────────────────────────────────────

/**
 * Natural language phrases that represent each intent.
 * These are what users might actually type — diverse phrasing improves
 * the robustness of the mean embedding for each intent cluster.
 *
 * The phrase set is the single source of truth in shared/intentPhrases.js so
 * the Node precompute script (scripts/precompute-embeddings.mjs) and this
 * runtime module embed the exact same data. Editing phrases there invalidates
 * the precomputed intent-vectors.bin via INTENT_PHRASES_HASH.
 *
 * Guidelines for phrases:
 * - Use full natural sentences/commands (not single keywords)
 * - Cover different phrasings of the same intent
 * - Include casual/informal variants real users would type
 * - 3–5 phrases per intent is sufficient for MiniLM discrimination
 */
export const INTENT_PHRASES = SHARED_INTENT_PHRASES as Record<IntentType, string[]>

/** FNV-1a hash of the phrase set — must match the hash embedded in intent-vectors.bin. */
export const INTENT_PHRASES_HASH = intentPhrasesHash()

// ─── Mutable Embeddings Store ───────────────────────────────────────────────

/**
 * The computed intent embeddings. Initially empty (zero vectors).
 * Populated by loadPrecomputedEmbeddings() (instant) or bootstrapIntentEmbeddings() (slow fallback).
 */
export let INTENT_EMBEDDINGS: IntentEmbeddingEntry[] = buildPlaceholders()

/** Whether bootstrap has completed (either from pre-computed file or runtime computation) */
let _bootstrapped = false

export function isBootstrapped(): boolean {
  return _bootstrapped
}

/**
 * Build placeholder entries with zero vectors.
 * Used before bootstrap completes — cosine similarity with zero vectors
 * yields 0, causing the engine to fall back to keyword classification.
 */
function buildPlaceholders(): IntentEmbeddingEntry[] {
  const entries: IntentEmbeddingEntry[] = []

  for (const [intentType, phrases] of Object.entries(INTENT_PHRASES)) {
    if (intentType === 'unknown' || phrases.length === 0) continue

    entries.push({
      intentType: intentType as IntentType,
      embedding: new Float32Array(EMBEDDING_DIM), // Zero vector
      phrases,
    })
  }

  return entries
}

// ─── Pre-computed Loading (Fast Path) ───────────────────────────────────────

/** URL for the pre-computed intent vectors binary */
const INTENT_VECTORS_URL = '/models/minilm/intent-vectors.bin'

/**
 * Load pre-computed intent embeddings from a binary file.
 * This is the fast path — loads in <10ms vs 2-4s for runtime computation.
 *
 * Binary format (version 2):
 *   [version: u32][numIntents: u32][dim: u32][phrasesHash: u32]
 *   [name: 32 bytes utf8][numPhrases: u32] × numIntents
 *   [embedding: float32 × dim] × numIntents
 *
 * The phrasesHash guards against stale vectors: if the runtime phrase set
 * (shared/intentPhrases.js) has changed since the binary was generated, the
 * hash won't match and we fall back to runtime bootstrap rather than serving
 * embeddings that no longer correspond to the current phrases. Version 1
 * (no hash field) is treated as stale and rejected.
 *
 * @returns true if loaded successfully, false if file not available/stale
 */
export const INTENT_VECTORS_VERSION = 2

export async function loadPrecomputedEmbeddings(): Promise<boolean> {
  if (_bootstrapped) return true

  try {
    const response = await fetch(INTENT_VECTORS_URL)
    if (!response.ok) return false

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength < 16) return false
    const view = new DataView(buffer)

    // Read header
    const version = view.getUint32(0, true)
    if (version !== INTENT_VECTORS_VERSION) return false

    const numIntents = view.getUint32(4, true)
    const dim = view.getUint32(8, true)
    if (dim !== EMBEDDING_DIM) return false

    // Reject vectors built from a different phrase set (stale precompute).
    const phrasesHash = view.getUint32(12, true)
    if (phrasesHash !== INTENT_PHRASES_HASH) return false

    let offset = 16
    const entries: IntentEmbeddingEntry[] = []

    // Read per-intent headers
    const intentMeta: Array<{ name: string; numPhrases: number }> = []
    for (let i = 0; i < numIntents; i++) {
      const nameBytes = new Uint8Array(buffer, offset, 32)
      const name = new TextDecoder().decode(nameBytes).replace(/\0+$/, '')
      offset += 32
      const numPhrases = view.getUint32(offset, true)
      offset += 4
      intentMeta.push({ name, numPhrases })
    }

    // Read embeddings
    for (let i = 0; i < numIntents; i++) {
      const embedding = new Float32Array(dim)
      for (let d = 0; d < dim; d++) {
        embedding[d] = view.getFloat32(offset, true)
        offset += 4
      }

      const intentType = intentMeta[i].name as IntentType
      const phrases = INTENT_PHRASES[intentType] ?? []

      entries.push({ intentType, embedding, phrases })
    }

    if (entries.length > 0) {
      INTENT_EMBEDDINGS = entries
      _bootstrapped = true
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Bootstrap the intent embeddings by computing MiniLM embeddings for
 * all representative phrases. Called once after the NLP engine becomes ready.
 *
 * @param embedFn - Function that computes a 384-dim embedding for a text string.
 *                  This is the NLPWorkerBridge.embed() result's rawEmbedding.
 */
export async function bootstrapIntentEmbeddings(
  embedFn: (text: string) => Promise<Float32Array | null>,
): Promise<void> {
  if (_bootstrapped) return

  const entries: IntentEmbeddingEntry[] = []

  for (const [intentType, phrases] of Object.entries(INTENT_PHRASES)) {
    if (intentType === 'unknown' || phrases.length === 0) continue

    // Compute embeddings for all phrases
    const phraseEmbeddings: Float32Array[] = []

    for (const phrase of phrases) {
      const embedding = await embedFn(phrase)
      if (embedding && embedding.length === EMBEDDING_DIM) {
        phraseEmbeddings.push(embedding)
      }
    }

    if (phraseEmbeddings.length === 0) {
      // No successful embeddings — skip this intent
      continue
    }

    // Mean pool all phrase embeddings into one representative vector
    const meanEmbedding = new Float32Array(EMBEDDING_DIM)
    for (const emb of phraseEmbeddings) {
      for (let d = 0; d < EMBEDDING_DIM; d++) {
        meanEmbedding[d] += emb[d]
      }
    }
    for (let d = 0; d < EMBEDDING_DIM; d++) {
      meanEmbedding[d] /= phraseEmbeddings.length
    }

    // L2 normalize the mean embedding
    let norm = 0
    for (let d = 0; d < EMBEDDING_DIM; d++) {
      norm += meanEmbedding[d] * meanEmbedding[d]
    }
    norm = Math.sqrt(norm)
    if (norm > 0) {
      for (let d = 0; d < EMBEDDING_DIM; d++) {
        meanEmbedding[d] /= norm
      }
    }

    entries.push({
      intentType: intentType as IntentType,
      embedding: meanEmbedding,
      phrases,
    })
  }

  if (entries.length > 0) {
    INTENT_EMBEDDINGS = entries
    _bootstrapped = true
  }
}

/**
 * Reset embeddings to placeholders (for testing).
 */
export function resetIntentEmbeddings(): void {
  INTENT_EMBEDDINGS = buildPlaceholders()
  _bootstrapped = false
}

/**
 * Bootstrap from a cached set of intent embeddings (from IndexedDB).
 * Faster than runtime computation since no inference is needed.
 */
export function bootstrapFromCache(
  cached: Array<{ name: string; embedding: Float32Array }>,
): void {
  if (_bootstrapped) return

  const entries: IntentEmbeddingEntry[] = []
  for (const { name, embedding } of cached) {
    const intentType = name as IntentType
    const phrases = INTENT_PHRASES[intentType] ?? []
    if (phrases.length === 0) continue
    entries.push({ intentType, embedding, phrases })
  }

  if (entries.length > 0) {
    INTENT_EMBEDDINGS = entries
    _bootstrapped = true
  }
}
