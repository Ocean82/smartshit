/**
 * Unit tests for the Model Manager
 *
 * Tests versioning, caching, checksum validation, download timeout,
 * and bundled model fallback behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createModelManager, validateChecksum } from '../modelManager'
import type { NLPConfig, ModelManifest } from '../types'

// ─── Test helpers ───────────────────────────────────────────────────────────

function createTestConfig(overrides?: Partial<NLPConfig>): NLPConfig {
  return {
    modelBaseUrl: 'https://cdn.example.com/models/nlp/v1/',
    bundledModelVersion: '0.1.0',
    fallbackThreshold: 0.6,
    initTimeoutMs: 10_000,
    maxRetries: 1,
    maxMacroSteps: 5,
    inferenceTimeoutMs: 500,
    ...overrides,
  }
}

/** Compute a real SHA-256 hex hash from an ArrayBuffer */
async function computeSHA256(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Mock Cache API ─────────────────────────────────────────────────────────

let mockCacheStore: Map<string, Response>

const mockCache = {
  put: vi.fn(async (key: string | Request, response: Response) => {
    const k = typeof key === 'string' ? key : key.url
    mockCacheStore.set(k, response.clone())
  }),
  match: vi.fn(async (key: string | Request) => {
    const k = typeof key === 'string' ? key : key.url
    const resp = mockCacheStore.get(k)
    return resp ? resp.clone() : undefined
  }),
}

const mockCaches = {
  open: vi.fn(async () => mockCache),
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  mockCacheStore = new Map()
  vi.stubGlobal('caches', mockCaches)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('validateChecksum', () => {
  it('returns true for matching checksum', async () => {
    const data = new TextEncoder().encode('hello world').buffer as ArrayBuffer
    const expectedHash = await computeSHA256(data)

    const result = await validateChecksum(data, expectedHash)
    expect(result).toBe(true)
  })

  it('returns true for case-insensitive checksum comparison', async () => {
    const data = new TextEncoder().encode('test data').buffer as ArrayBuffer
    const expectedHash = await computeSHA256(data)

    // Upper-case should still match
    const result = await validateChecksum(data, expectedHash.toUpperCase())
    expect(result).toBe(true)
  })

  it('returns false for mismatched checksum', async () => {
    const data = new TextEncoder().encode('hello world').buffer as ArrayBuffer
    const wrongHash = 'a'.repeat(64)

    const result = await validateChecksum(data, wrongHash)
    expect(result).toBe(false)
  })

  it('returns false for empty expected checksum', async () => {
    const data = new TextEncoder().encode('data').buffer as ArrayBuffer
    const result = await validateChecksum(data, '')
    expect(result).toBe(false)
  })
})

describe('createModelManager', () => {
  describe('getCurrentVersion', () => {
    it('returns null initially', () => {
      const manager = createModelManager(createTestConfig())
      expect(manager.getCurrentVersion()).toBeNull()
    })

    it('returns bundled version after getBundledModel call', () => {
      const manager = createModelManager(createTestConfig({ bundledModelVersion: '1.0.0' }))
      manager.getBundledModel()
      expect(manager.getCurrentVersion()).toBe('1.0.0')
    })
  })

  describe('getBundledModel', () => {
    it('returns an ArrayBuffer', () => {
      const manager = createModelManager(createTestConfig())
      const model = manager.getBundledModel()
      expect(model).toBeInstanceOf(ArrayBuffer)
    })

    it('sets the current version to bundled version', () => {
      const manager = createModelManager(createTestConfig({ bundledModelVersion: '0.5.0' }))
      manager.getBundledModel()
      expect(manager.getCurrentVersion()).toBe('0.5.0')
    })
  })

  describe('checkForUpdate', () => {
    it('returns manifest when a new version is available', async () => {
      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum: 'abc123',
        size: 1024,
      }

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(manifest), { status: 200 })
      )

      const manager = createModelManager(createTestConfig())
      const result = await manager.checkForUpdate()
      expect(result).toEqual(manifest)
    })

    it('returns null when current version matches manifest version', async () => {
      const manifest: ModelManifest = {
        version: '1.0.0',
        url: 'https://cdn.example.com/models/nlp/v1/model.wasm',
        checksum: 'abc123',
        size: 1024,
      }

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(manifest), { status: 200 })
      )

      const manager = createModelManager(createTestConfig({ bundledModelVersion: '1.0.0' }))
      manager.getBundledModel() // set currentVersion to '1.0.0'

      const result = await manager.checkForUpdate()
      expect(result).toBeNull()
    })

    it('returns null on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      const manager = createModelManager(createTestConfig())
      const result = await manager.checkForUpdate()
      expect(result).toBeNull()
    })

    it('returns null on non-OK response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Not Found', { status: 404 })
      )

      const manager = createModelManager(createTestConfig())
      const result = await manager.checkForUpdate()
      expect(result).toBeNull()
    })

    it('fetches manifest from correct URL with trailing slash', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ version: '1.0.0', url: '', checksum: '', size: 0 }), { status: 200 })
      )

      const manager = createModelManager(createTestConfig({ modelBaseUrl: 'https://cdn.test.com/models' }))
      await manager.checkForUpdate()

      expect(fetch).toHaveBeenCalledWith(
        'https://cdn.test.com/models/manifest.json',
        { cache: 'no-cache' }
      )
    })
  })

  describe('downloadAndValidate', () => {
    it('downloads and validates model with correct checksum', async () => {
      const modelData = new TextEncoder().encode('model binary data')
      const checksum = await computeSHA256(modelData.buffer as ArrayBuffer)

      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum,
        size: modelData.byteLength,
      }

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(modelData, { status: 200 })
      )

      const manager = createModelManager(createTestConfig())
      const result = await manager.downloadAndValidate(manifest)

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result.byteLength).toBe(modelData.byteLength)
      expect(manager.getCurrentVersion()).toBe('2.0.0')
    })

    it('throws on checksum mismatch', async () => {
      const modelData = new TextEncoder().encode('some data')

      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum: 'incorrect_checksum_value_that_does_not_match_at_all',
        size: modelData.byteLength,
      }

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(modelData, { status: 200 })
      )

      const manager = createModelManager(createTestConfig())
      await expect(manager.downloadAndValidate(manifest)).rejects.toThrow(
        'Model checksum validation failed'
      )
    })

    it('throws on HTTP error', async () => {
      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum: 'abc',
        size: 100,
      }

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('Server Error', { status: 500 })
      )

      const manager = createModelManager(createTestConfig())
      await expect(manager.downloadAndValidate(manifest)).rejects.toThrow(
        'Model download failed: HTTP 500'
      )
    })

    it('throws on timeout (abort signal)', async () => {
      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum: 'abc',
        size: 100,
      }

      // Simulate an abort error
      const abortError = new DOMException('The operation was aborted.', 'AbortError')
      vi.mocked(fetch).mockRejectedValueOnce(abortError)

      const manager = createModelManager(createTestConfig())
      await expect(manager.downloadAndValidate(manifest)).rejects.toThrow(
        'Model download timed out (60s limit exceeded)'
      )
    })

    it('caches model after successful download and validation', async () => {
      const modelData = new TextEncoder().encode('cached model')
      const checksum = await computeSHA256(modelData.buffer as ArrayBuffer)

      const manifest: ModelManifest = {
        version: '3.0.0',
        url: 'https://cdn.example.com/models/nlp/v3/model.wasm',
        checksum,
        size: modelData.byteLength,
      }

      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(modelData, { status: 200 })
      )

      const manager = createModelManager(createTestConfig())
      await manager.downloadAndValidate(manifest)

      // Verify that the cache was written to
      expect(mockCache.put).toHaveBeenCalledTimes(2) // model + manifest
    })
  })

  describe('getCachedModel', () => {
    it('returns null when no model is cached', async () => {
      const manager = createModelManager(createTestConfig())
      const result = await manager.getCachedModel()
      expect(result).toBeNull()
    })

    it('returns cached model data when available', async () => {
      const modelData = new TextEncoder().encode('cached model data')
      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum: 'abc',
        size: modelData.byteLength,
      }

      // Pre-populate the mock cache
      mockCacheStore.set(
        'nlp-model-manifest',
        new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } })
      )
      mockCacheStore.set(
        manifest.url,
        new Response(modelData, { headers: { 'Content-Type': 'application/octet-stream' } })
      )

      const manager = createModelManager(createTestConfig())
      const result = await manager.getCachedModel()

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result!.byteLength).toBe(modelData.byteLength)
      expect(manager.getCurrentVersion()).toBe('2.0.0')
    })

    it('returns null if manifest is cached but model data is missing', async () => {
      const manifest: ModelManifest = {
        version: '2.0.0',
        url: 'https://cdn.example.com/models/nlp/v2/model.wasm',
        checksum: 'abc',
        size: 100,
      }

      // Only cache the manifest, not the model
      mockCacheStore.set(
        'nlp-model-manifest',
        new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } })
      )

      const manager = createModelManager(createTestConfig())
      const result = await manager.getCachedModel()
      expect(result).toBeNull()
    })
  })
})
