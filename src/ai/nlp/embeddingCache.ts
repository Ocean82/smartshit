/**
 * IndexedDB Embedding Cache
 *
 * Persists computed embeddings across sessions so repeat queries and
 * intent bootstrap vectors don't require re-inference on page reload.
 *
 * Two stores:
 * - 'queries': user query embeddings (LRU, max 128 entries)
 * - 'bootstrap': intent reference vectors (keyed by version hash)
 *
 * Uses a single 'nlp-embeddings' database with version 1.
 * Falls back gracefully if IndexedDB is unavailable (private browsing, etc).
 */

import { EMBEDDING_DIM } from './intentEmbeddings'

// ─── Constants ──────────────────────────────────────────────────────────────

const DB_NAME = 'smartsht-nlp-embeddings'
const DB_VERSION = 1
const STORE_QUERIES = 'queries'
const STORE_BOOTSTRAP = 'bootstrap'
const MAX_QUERY_ENTRIES = 128

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueryEntry {
  text: string
  embedding: Float32Array
  timestamp: number
}

interface BootstrapEntry {
  version: string
  intents: Array<{
    name: string
    embedding: Float32Array
  }>
  timestamp: number
}

// ─── Database Initialization ────────────────────────────────────────────────

let _db: IDBDatabase | null = null
let _dbReady: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (_dbReady) return _dbReady

  _dbReady = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains(STORE_QUERIES)) {
          const store = db.createObjectStore(STORE_QUERIES, { keyPath: 'text' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }

        if (!db.objectStoreNames.contains(STORE_BOOTSTRAP)) {
          db.createObjectStore(STORE_BOOTSTRAP, { keyPath: 'version' })
        }
      }

      request.onsuccess = (event) => {
        _db = (event.target as IDBOpenDBRequest).result
        resolve(_db)
      }

      request.onerror = () => {
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })

  return _dbReady
}

// ─── Query Embedding Cache ──────────────────────────────────────────────────

/**
 * Get a cached embedding for a query string.
 * Returns null if not found or IndexedDB unavailable.
 */
export async function getCachedEmbedding(text: string): Promise<Float32Array | null> {
  const db = await openDB()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_QUERIES, 'readonly')
      const store = tx.objectStore(STORE_QUERIES)
      const request = store.get(text)

      request.onsuccess = () => {
        const entry = request.result as QueryEntry | undefined
        if (entry?.embedding) {
          // Update timestamp (fire and forget)
          touchEntry(db, text)
          resolve(new Float32Array(entry.embedding))
        } else {
          resolve(null)
        }
      }

      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Store a computed embedding in the cache.
 * Evicts oldest entries if cache exceeds MAX_QUERY_ENTRIES.
 */
export async function setCachedEmbedding(text: string, embedding: Float32Array): Promise<void> {
  const db = await openDB()
  if (!db) return

  try {
    const tx = db.transaction(STORE_QUERIES, 'readwrite')
    const store = tx.objectStore(STORE_QUERIES)

    const entry: QueryEntry = {
      text,
      embedding: new Float32Array(embedding), // Copy to avoid detached buffer issues
      timestamp: Date.now(),
    }

    store.put(entry)

    // Check count and evict if needed
    const countReq = store.count()
    countReq.onsuccess = () => {
      if (countReq.result > MAX_QUERY_ENTRIES) {
        evictOldest(db, countReq.result - MAX_QUERY_ENTRIES)
      }
    }
  } catch {
    // Non-fatal — cache write failure doesn't affect functionality
  }
}

// ─── Bootstrap Vector Cache ─────────────────────────────────────────────────

/**
 * Get cached bootstrap vectors by version key.
 * Returns the intent embeddings array or null if not cached.
 */
export async function getCachedBootstrap(
  version: string,
): Promise<Array<{ name: string; embedding: Float32Array }> | null> {
  const db = await openDB()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_BOOTSTRAP, 'readonly')
      const store = tx.objectStore(STORE_BOOTSTRAP)
      const request = store.get(version)

      request.onsuccess = () => {
        const entry = request.result as BootstrapEntry | undefined
        if (entry?.intents) {
          // Reconstruct Float32Arrays (they get serialized as plain objects in IDB)
          const intents = entry.intents.map((i) => ({
            name: i.name,
            embedding: new Float32Array(i.embedding),
          }))
          resolve(intents)
        } else {
          resolve(null)
        }
      }

      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Store bootstrap vectors in IndexedDB.
 * Keyed by version so different model versions don't conflict.
 */
export async function setCachedBootstrap(
  version: string,
  intents: Array<{ name: string; embedding: Float32Array }>,
): Promise<void> {
  const db = await openDB()
  if (!db) return

  try {
    const tx = db.transaction(STORE_BOOTSTRAP, 'readwrite')
    const store = tx.objectStore(STORE_BOOTSTRAP)

    const entry: BootstrapEntry = {
      version,
      intents: intents.map((i) => ({
        name: i.name,
        embedding: new Float32Array(i.embedding), // Copy
      })),
      timestamp: Date.now(),
    }

    store.put(entry)
  } catch {
    // Non-fatal
  }
}

// ─── Private Helpers ────────────────────────────────────────────────────────

function touchEntry(db: IDBDatabase, text: string): void {
  try {
    const tx = db.transaction(STORE_QUERIES, 'readwrite')
    const store = tx.objectStore(STORE_QUERIES)
    const request = store.get(text)
    request.onsuccess = () => {
      const entry = request.result as QueryEntry | undefined
      if (entry) {
        entry.timestamp = Date.now()
        store.put(entry)
      }
    }
  } catch {
    // Non-fatal
  }
}

function evictOldest(db: IDBDatabase, count: number): void {
  try {
    const tx = db.transaction(STORE_QUERIES, 'readwrite')
    const store = tx.objectStore(STORE_QUERIES)
    const index = store.index('timestamp')
    const request = index.openCursor()
    let evicted = 0

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
      if (cursor && evicted < count) {
        cursor.delete()
        evicted++
        cursor.continue()
      }
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Clear all cached data (for testing or reset).
 */
export async function clearEmbeddingCache(): Promise<void> {
  const db = await openDB()
  if (!db) return

  try {
    const tx = db.transaction([STORE_QUERIES, STORE_BOOTSTRAP], 'readwrite')
    tx.objectStore(STORE_QUERIES).clear()
    tx.objectStore(STORE_BOOTSTRAP).clear()
  } catch {
    // Non-fatal
  }
}
