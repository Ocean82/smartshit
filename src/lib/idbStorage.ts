/**
 * Minimal promise-based IndexedDB key/value store.
 *
 * Why: localStorage caps at ~5MB and stringifies synchronously, so large
 * workbooks fail to save (quota) and unload-time saves jank. IndexedDB has no
 * practical size cap and writes off the main thread. This is a deliberately
 * tiny wrapper (one object store, get/set/del) — no new dependency.
 *
 * Everything degrades gracefully: if IndexedDB is missing or blocked (SSR,
 * private mode, disabled storage), reads resolve to null and writes resolve to
 * false rather than throwing, so callers can fall back to localStorage.
 */

const DB_NAME = 'smartsht'
const STORE_NAME = 'kv'
const DB_VERSION = 1

let _dbPromise: Promise<IDBDatabase | null> | null = null

/** True when IndexedDB is usable in this environment. */
function idbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    // Accessing indexedDB can throw in some sandboxed/blocked contexts.
    return false
  }
}

/** Open (once) the database, creating the object store on first use. */
function openDb(): Promise<IDBDatabase | null> {
  if (_dbPromise) return _dbPromise
  if (!idbAvailable()) {
    _dbPromise = Promise.resolve(null)
    return _dbPromise
  }

  _dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })

  return _dbPromise
}

/** Run a transaction on the kv store, resolving to null on any failure. */
function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }
        try {
          const tx = db.transaction(STORE_NAME, mode)
          const req = fn(tx.objectStore(STORE_NAME))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(null)
          tx.onerror = () => resolve(null)
          tx.onabort = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

/** Read a value by key. Resolves to null when absent or IDB is unavailable. */
export async function idbGet<T>(key: string): Promise<T | null> {
  const result = await withStore<T>('readonly', (store) => store.get(key) as IDBRequest<T>)
  return result ?? null
}

/**
 * Write a value by key. Resolves true on success, false if IDB is unavailable
 * or the write failed (caller should fall back to localStorage).
 */
export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  // `put` returns the key on success; treat a null (failure) as false.
  const result = await withStore<IDBValidKey>('readwrite', (store) => store.put(value, key))
  return result !== null
}

/** Delete a value by key. Resolves true on success (or no-op), false on failure. */
export async function idbDel(key: string): Promise<boolean> {
  if (!idbAvailable()) return false
  const result = await withStore<undefined>('readwrite', (store) => store.delete(key) as IDBRequest<undefined>)
  // delete() yields `undefined` on success; withStore maps failure to null.
  return result === undefined ? true : result !== null
}

/** Test seam: drop the cached connection so a fresh open() runs next call. */
export function _resetIdbForTests(): void {
  _dbPromise = null
}
