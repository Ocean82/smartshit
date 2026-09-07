/**
 * Capability Embeddings — reference vectors for Tier-2 semantic tool routing.
 *
 * Mirrors intentEmbeddings.ts: precomputed bin fast path, runtime bootstrap
 * fallback, hash guard against stale vectors.
 */

import {
  CAPABILITIES,
  capabilityExamplesMap,
  capabilityPhrasesHash,
  type CapabilityDef,
} from '@shared/capabilities.js'

export const EMBEDDING_DIM = 384
export const CAPABILITY_VECTORS_VERSION = 2
export const CAPABILITY_PHRASES_HASH = capabilityPhrasesHash()

export interface CapabilityEmbeddingEntry {
  capabilityId: string
  embedding: Float32Array
  phrases: string[]
}

const CAPABILITY_VECTORS_URL = '/models/minilm/capability-vectors.bin'

let CAPABILITY_EMBEDDINGS: CapabilityEmbeddingEntry[] = []
let _bootstrapped = false

export function isCapabilityBootstrapped(): boolean {
  return _bootstrapped
}

export function getCapabilityEmbeddings(): readonly CapabilityEmbeddingEntry[] {
  return CAPABILITY_EMBEDDINGS
}

export function resetCapabilityEmbeddingsForTests(): void {
  CAPABILITY_EMBEDDINGS = []
  _bootstrapped = false
}

/** Inject embeddings in unit tests without MiniLM. */
export function setCapabilityEmbeddingsForTests(entries: CapabilityEmbeddingEntry[]): void {
  CAPABILITY_EMBEDDINGS = entries
  _bootstrapped = entries.length > 0
}

function l2Normalize(vec: Float32Array): void {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm
  }
}

function meanOfEmbeddings(embeddings: Float32Array[]): Float32Array {
  const mean = new Float32Array(EMBEDDING_DIM)
  for (const emb of embeddings) {
    for (let d = 0; d < EMBEDDING_DIM; d++) mean[d] += emb[d]
  }
  for (let d = 0; d < EMBEDDING_DIM; d++) mean[d] /= embeddings.length
  l2Normalize(mean)
  return mean
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}

/**
 * Score a query embedding against all capability reference vectors.
 * Returns best and second-best for ambiguity checks.
 */
export function scoreCapabilities(queryEmbedding: Float32Array): {
  best: { capabilityId: string; score: number; capability: CapabilityDef } | null
  secondScore: number
} {
  if (!_bootstrapped || CAPABILITY_EMBEDDINGS.length === 0) {
    return { best: null, secondScore: 0 }
  }

  let bestId = ''
  let bestScore = -1
  let secondScore = -1

  for (const entry of CAPABILITY_EMBEDDINGS) {
    const score = cosineSimilarity(queryEmbedding, entry.embedding)
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      bestId = entry.capabilityId
    } else if (score > secondScore) {
      secondScore = score
    }
  }

  const capability = CAPABILITIES.find((c) => c.id === bestId)
  if (!capability || bestScore < 0) return { best: null, secondScore: Math.max(0, secondScore) }

  return {
    best: { capabilityId: bestId, score: bestScore, capability },
    secondScore: Math.max(0, secondScore),
  }
}

export async function loadPrecomputedCapabilityEmbeddings(): Promise<boolean> {
  if (_bootstrapped) return true

  try {
    const response = await fetch(CAPABILITY_VECTORS_URL)
    if (!response.ok) return false

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength < 16) return false
    const view = new DataView(buffer)

    const version = view.getUint32(0, true)
    if (version !== CAPABILITY_VECTORS_VERSION) return false

    const numCaps = view.getUint32(4, true)
    const dim = view.getUint32(8, true)
    if (dim !== EMBEDDING_DIM) return false

    const phrasesHash = view.getUint32(12, true)
    if (phrasesHash !== CAPABILITY_PHRASES_HASH) return false

    let offset = 16
    const meta: Array<{ name: string; numPhrases: number }> = []
    for (let i = 0; i < numCaps; i++) {
      const nameBytes = new Uint8Array(buffer, offset, 32)
      const name = new TextDecoder().decode(nameBytes).replace(/\0+$/, '')
      offset += 32
      const numPhrases = view.getUint32(offset, true)
      offset += 4
      meta.push({ name, numPhrases })
    }

    const phraseMap = capabilityExamplesMap()
    const entries: CapabilityEmbeddingEntry[] = []
    for (let i = 0; i < numCaps; i++) {
      const embedding = new Float32Array(dim)
      for (let d = 0; d < dim; d++) {
        embedding[d] = view.getFloat32(offset, true)
        offset += 4
      }
      entries.push({
        capabilityId: meta[i].name,
        embedding,
        phrases: phraseMap[meta[i].name] ?? [],
      })
    }

    if (entries.length === 0) return false
    CAPABILITY_EMBEDDINGS = entries
    _bootstrapped = true
    return true
  } catch {
    return false
  }
}

export async function bootstrapCapabilityEmbeddings(
  embedFn: (text: string) => Promise<Float32Array | null>,
): Promise<void> {
  if (_bootstrapped) return

  const entries: CapabilityEmbeddingEntry[] = []
  for (const cap of CAPABILITIES) {
    if (cap.examples.length === 0) continue
    const phraseEmbeddings: Float32Array[] = []
    for (const phrase of cap.examples) {
      const embedding = await embedFn(phrase)
      if (embedding && embedding.length === EMBEDDING_DIM) {
        phraseEmbeddings.push(embedding)
      }
    }
    if (phraseEmbeddings.length === 0) continue
    entries.push({
      capabilityId: cap.id,
      embedding: meanOfEmbeddings(phraseEmbeddings),
      phrases: cap.examples,
    })
  }

  if (entries.length > 0) {
    CAPABILITY_EMBEDDINGS = entries
    _bootstrapped = true
  }
}
