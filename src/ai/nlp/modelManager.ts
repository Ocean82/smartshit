/**
 * Model Manager
 *
 * Handles NLP model versioning, caching (via Cache API), downloading with
 * 60-second timeout, and SHA-256 checksum validation. Supports a bundled
 * default model as a first-load fallback.
 *
 * @module modelManager
 */

import type { ModelManifest, NLPConfig } from './types'

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_NAME = 'nlp-model-cache'
const MANIFEST_CACHE_KEY = 'nlp-model-manifest'
const MODEL_DOWNLOAD_TIMEOUT_MS = 60_000

// ─── Public Interface ───────────────────────────────────────────────────────

export interface ModelManager {
  getCurrentVersion(): string | null
  checkForUpdate(): Promise<ModelManifest | null>
  downloadAndValidate(manifest: ModelManifest): Promise<ArrayBuffer>
  getCachedModel(): Promise<ArrayBuffer | null>
  getBundledModel(): ArrayBuffer
}

// ─── Checksum Validation (exported for independent testing — Property 17) ───

/**
 * Validates that the SHA-256 hash of `data` matches `expectedChecksum`.
 * Comparison is case-insensitive hex.
 */
export async function validateChecksum(
  data: ArrayBuffer,
  expectedChecksum: string
): Promise<boolean> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const actualHex = arrayBufferToHex(hashBuffer)
  return actualHex === expectedChecksum.toLowerCase()
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Creates a ModelManager instance configured with the given NLP config.
 */
export function createModelManager(config: NLPConfig): ModelManager {
  let currentVersion: string | null = null

  return {
    getCurrentVersion(): string | null {
      return currentVersion
    },

    async checkForUpdate(): Promise<ModelManifest | null> {
      const manifestUrl = `${normalizeBaseUrl(config.modelBaseUrl)}manifest.json`
      try {
        const response = await fetch(manifestUrl, { cache: 'no-cache' })
        if (!response.ok) return null

        const manifest: ModelManifest = await response.json()

        // If we already have this version cached, no update needed
        if (currentVersion && manifest.version === currentVersion) {
          return null
        }

        // Check against any previously cached manifest
        const cachedManifest = await getCachedManifest()
        if (cachedManifest && cachedManifest.version === manifest.version) {
          // We have this version already cached — not a new update
          // But if currentVersion is null, we haven't loaded it yet
          if (currentVersion === cachedManifest.version) return null
        }

        return manifest
      } catch {
        // Network error — no update detected
        return null
      }
    },

    async downloadAndValidate(manifest: ModelManifest): Promise<ArrayBuffer> {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), MODEL_DOWNLOAD_TIMEOUT_MS)

      try {
        const response = await fetch(manifest.url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Model download failed: HTTP ${response.status}`)
        }

        const data = await response.arrayBuffer()

        // Validate checksum
        const valid = await validateChecksum(data, manifest.checksum)
        if (!valid) {
          const actualHash = arrayBufferToHex(
            await crypto.subtle.digest('SHA-256', data)
          )
          throw Object.assign(
            new Error('Model checksum validation failed'),
            { code: 'MODEL_CHECKSUM_MISMATCH', expected: manifest.checksum, actual: actualHash }
          )
        }

        // Cache the validated model and manifest
        await cacheModel(manifest, data)
        currentVersion = manifest.version

        return data
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw Object.assign(
            new Error('Model download timed out (60s limit exceeded)'),
            { code: 'MODEL_DOWNLOAD_FAILED' }
          )
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    },

    async getCachedModel(): Promise<ArrayBuffer | null> {
      try {
        const cache = await caches.open(CACHE_NAME)
        const cachedManifest = await getCachedManifest()
        if (!cachedManifest) return null

        const modelResponse = await cache.match(cachedManifest.url)
        if (!modelResponse) return null

        const data = await modelResponse.arrayBuffer()
        currentVersion = cachedManifest.version
        return data
      } catch {
        return null
      }
    },

    getBundledModel(): ArrayBuffer {
      // Returns a placeholder empty ArrayBuffer for the bundled default model.
      // The actual WASM binary will be added later when the embedding model
      // is integrated. This ensures the system has a fallback on first load.
      currentVersion = config.bundledModelVersion
      return new ArrayBuffer(0)
    },
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/** Convert an ArrayBuffer to a lowercase hex string */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/** Ensure base URL ends with a trailing slash */
function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

/** Cache the model binary and its manifest metadata */
async function cacheModel(manifest: ModelManifest, data: ArrayBuffer): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME)

    // Store the model binary keyed by its URL
    const modelResponse = new Response(data, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    await cache.put(manifest.url, modelResponse)

    // Store the manifest metadata
    const manifestResponse = new Response(JSON.stringify(manifest), {
      headers: { 'Content-Type': 'application/json' },
    })
    await cache.put(MANIFEST_CACHE_KEY, manifestResponse)
  } catch {
    // Cache write failures are non-critical — log if diagnostics needed
  }
}

/** Retrieve the previously cached manifest metadata */
async function getCachedManifest(): Promise<ModelManifest | null> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(MANIFEST_CACHE_KEY)
    if (!response) return null
    return await response.json()
  } catch {
    return null
  }
}
