/**
 * intent-vectors.bin format contract tests (version 2).
 *
 * The precompute step (scripts/precompute-embeddings.mjs) writes a binary blob
 * that the client parses in loadPrecomputedEmbeddings(). CI never runs the
 * ONNX precompute (ONNXRUNTIME_NODE_INSTALL=skip, no model:precompute step),
 * so a regression in either the writer layout or the reader would otherwise
 * ship silently. These tests pin the wire format by encoding vectors with the
 * exact writer layout and asserting the reader round-trips them losslessly.
 *
 * Writer layout (must mirror scripts/precompute-embeddings.mjs):
 *   [version: u32 LE][numIntents: u32 LE][dim: u32 LE][phrasesHash: u32 LE]
 *   [name: 32 bytes utf8, null-padded][numPhrases: u32 LE] × numIntents
 *   [embedding: float32 LE × dim] × numIntents
 *
 * Both the writer and the reader import the phrase set and hash function from
 * shared/intentPhrases.js, so duplication-drift is structurally impossible.
 * The hash embedded in the binary must match the runtime hash for the client to
 * accept it — otherwise it falls back to slow runtime bootstrap.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  EMBEDDING_DIM,
  INTENT_EMBEDDINGS,
  INTENT_PHRASES,
  INTENT_PHRASES_HASH,
  INTENT_VECTORS_VERSION,
  isBootstrapped,
  loadPrecomputedEmbeddings,
  resetIntentEmbeddings,
} from '../intentEmbeddings'
import { intentPhrasesHash } from '@shared/intentPhrases.js'

const GLOBAL_HEADER_BYTES = 16 // version(4) + numIntents(4) + dim(4) + phrasesHash(4)
const NAME_BYTES = 32
const PER_INTENT_HEADER_BYTES = NAME_BYTES + 4 // name + numPhrases

interface IntentFixture {
  name: string
  numPhrases: number
  embedding: number[]
}

/**
 * Encode fixtures using the exact byte layout of precompute-embeddings.mjs (v2).
 * Defaults use the real INTENT_PHRASES_HASH so the reader accepts them.
 */
function encodeIntentVectors(
  intents: IntentFixture[],
  {
    version = INTENT_VECTORS_VERSION,
    dim = EMBEDDING_DIM,
    phrasesHash = INTENT_PHRASES_HASH,
  }: { version?: number; dim?: number; phrasesHash?: number } = {},
): ArrayBuffer {
  const headerSize = GLOBAL_HEADER_BYTES + intents.length * PER_INTENT_HEADER_BYTES
  const embeddingsSize = intents.length * dim * 4
  const buffer = new ArrayBuffer(headerSize + embeddingsSize)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const encoder = new TextEncoder()

  let offset = 0
  view.setUint32(offset, version, true)
  offset += 4
  view.setUint32(offset, intents.length, true)
  offset += 4
  view.setUint32(offset, dim, true)
  offset += 4
  view.setUint32(offset, phrasesHash, true)
  offset += 4

  for (const intent of intents) {
    const nameBytes = encoder.encode(intent.name)
    bytes.set(nameBytes.subarray(0, NAME_BYTES), offset)
    offset += NAME_BYTES
    view.setUint32(offset, intent.numPhrases, true)
    offset += 4
  }

  for (const intent of intents) {
    for (let d = 0; d < dim; d++) {
      view.setFloat32(offset, intent.embedding[d] ?? 0, true)
      offset += 4
    }
  }

  return buffer
}

/** Build a deterministic dim-length vector seeded per intent. */
function makeEmbedding(seed: number, dim = EMBEDDING_DIM): number[] {
  return Array.from({ length: dim }, (_, i) => Math.fround(Math.sin(seed + i) * 0.5))
}

function stubFetchWith(buffer: ArrayBuffer | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      buffer === null
        ? ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as Response)
        : ({ ok: true, arrayBuffer: async () => buffer } as Response),
    ),
  )
}

describe('intent-vectors.bin round-trip (v2)', () => {
  afterEach(() => {
    resetIntentEmbeddings()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('parses a valid v2 blob and populates INTENT_EMBEDDINGS losslessly', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'read', numPhrases: 5, embedding: makeEmbedding(1) },
      { name: 'filter', numPhrases: 4, embedding: makeEmbedding(2) },
      { name: 'sort', numPhrases: 3, embedding: makeEmbedding(3) },
    ]
    stubFetchWith(encodeIntentVectors(fixtures))

    const loaded = await loadPrecomputedEmbeddings()

    expect(loaded).toBe(true)
    expect(isBootstrapped()).toBe(true)
    expect(INTENT_EMBEDDINGS).toHaveLength(fixtures.length)

    fixtures.forEach((fixture, i) => {
      const entry = INTENT_EMBEDDINGS[i]
      expect(entry.intentType).toBe(fixture.name)
      expect(entry.embedding).toBeInstanceOf(Float32Array)
      expect(entry.embedding.length).toBe(EMBEDDING_DIM)
      // Float32 write/read is exact for values already coerced via Math.fround.
      expect(Array.from(entry.embedding.slice(0, 8))).toEqual(fixture.embedding.slice(0, 8))
      expect(entry.embedding[EMBEDDING_DIM - 1]).toBe(fixture.embedding[EMBEDDING_DIM - 1])
    })
  })

  it('reads the correct embedding for each intent (no offset drift)', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'analyze', numPhrases: 2, embedding: makeEmbedding(10) },
      { name: 'write', numPhrases: 2, embedding: makeEmbedding(20) },
    ]
    stubFetchWith(encodeIntentVectors(fixtures))

    await loadPrecomputedEmbeddings()

    // Full-vector equality proves per-intent byte offsets line up end to end.
    expect(Array.from(INTENT_EMBEDDINGS[0].embedding)).toEqual(
      fixtures[0].embedding.map((v) => Math.fround(v)),
    )
    expect(Array.from(INTENT_EMBEDDINGS[1].embedding)).toEqual(
      fixtures[1].embedding.map((v) => Math.fround(v)),
    )
  })

  it('strips null padding from 32-byte intent names', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'create_formula', numPhrases: 5, embedding: makeEmbedding(7) },
    ]
    stubFetchWith(encodeIntentVectors(fixtures))

    await loadPrecomputedEmbeddings()

    expect(INTENT_EMBEDDINGS[0].intentType).toBe('create_formula')
    expect(INTENT_EMBEDDINGS[0].intentType).not.toContain('\0')
  })

  // ─── Version / format rejection ───────────────────────────────────────────

  it('rejects version 1 (pre-hash format)', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'read', numPhrases: 5, embedding: makeEmbedding(1) },
    ]
    stubFetchWith(encodeIntentVectors(fixtures, { version: 1 }))

    expect(await loadPrecomputedEmbeddings()).toBe(false)
    expect(isBootstrapped()).toBe(false)
  })

  it('rejects a future version', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'read', numPhrases: 5, embedding: makeEmbedding(1) },
    ]
    stubFetchWith(encodeIntentVectors(fixtures, { version: 99 }))

    expect(await loadPrecomputedEmbeddings()).toBe(false)
    expect(isBootstrapped()).toBe(false)
  })

  it('rejects a dimension mismatch', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'read', numPhrases: 5, embedding: makeEmbedding(1, 128) },
    ]
    stubFetchWith(encodeIntentVectors(fixtures, { dim: 128 }))

    expect(await loadPrecomputedEmbeddings()).toBe(false)
    expect(isBootstrapped()).toBe(false)
  })

  // ─── Stale-vector hash rejection ──────────────────────────────────────────

  it('rejects a stale phrasesHash (binary from an older phrase set)', async () => {
    const fixtures: IntentFixture[] = [
      { name: 'read', numPhrases: 5, embedding: makeEmbedding(1) },
    ]
    // Embed a different hash to simulate a stale binary.
    stubFetchWith(encodeIntentVectors(fixtures, { phrasesHash: 0xdeadbeef }))

    expect(await loadPrecomputedEmbeddings()).toBe(false)
    expect(isBootstrapped()).toBe(false)
  })

  it('returns false when the file is not available (404)', async () => {
    stubFetchWith(null)

    expect(await loadPrecomputedEmbeddings()).toBe(false)
    expect(isBootstrapped()).toBe(false)
  })

  it('returns false for a buffer too small to hold the v2 header', async () => {
    // 12 bytes = valid v1 header size but not enough for v2's 16-byte header.
    stubFetchWith(new ArrayBuffer(12))

    expect(await loadPrecomputedEmbeddings()).toBe(false)
    expect(isBootstrapped()).toBe(false)
  })
})

// ─── Phrase hash parity ─────────────────────────────────────────────────────
// Both the precompute writer (shared/intentPhrases.js) and the runtime reader
// (intentEmbeddings.ts) import from the same shared module. These tests verify
// the hash function and the re-export are consistent.

describe('INTENT_PHRASES_HASH parity', () => {
  it('matches the shared hash function output for the same phrases', () => {
    // INTENT_PHRASES_HASH is computed at module load in intentEmbeddings.ts.
    // Recompute from shared source and assert equality.
    expect(INTENT_PHRASES_HASH).toBe(intentPhrasesHash(INTENT_PHRASES))
  })

  it('is a valid unsigned 32-bit integer', () => {
    expect(Number.isInteger(INTENT_PHRASES_HASH)).toBe(true)
    expect(INTENT_PHRASES_HASH).toBeGreaterThanOrEqual(0)
    expect(INTENT_PHRASES_HASH).toBeLessThanOrEqual(0xffffffff)
  })

  it('changes when the phrases change', () => {
    const modifiedPhrases = { ...INTENT_PHRASES, read: ['different phrase for testing'] }
    const modifiedHash = intentPhrasesHash(modifiedPhrases)
    expect(modifiedHash).not.toBe(INTENT_PHRASES_HASH)
  })
})
