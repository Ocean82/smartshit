/**
 * AI Function Registry
 *
 * Provides an async custom function registration system inspired by Univer's
 * AsyncCustomFunction pattern. Allows registering AI-powered formula functions
 * (e.g., =AI.CATEGORIZE(A1), =AI.SENTIMENT(B2)) that call the LLM backend
 * asynchronously and return results into cells.
 *
 * Architecture:
 *   BaseAIFunction → AIFunction (sync) / AsyncAIFunction (async, LLM-backed)
 *   AIFunctionRegistry manages registration, lifecycle, caching, and execution.
 */

export interface AIFunctionParam {
  name: string
  description: string
  required: boolean
  type: 'string' | 'number' | 'range' | 'any'
  example?: string
}

export interface AIFunctionInfo {
  /** Function name as used in formulas, e.g. "AI.CATEGORIZE" */
  name: string
  /** Human-readable description shown in autocomplete */
  description: string
  /** Short abstract for the autocomplete dropdown */
  abstract: string
  /** Function category */
  category: 'AI' | 'AI/Text' | 'AI/Analysis' | 'AI/Finance'
  /** Syntax example */
  syntax: string
  /** Parameter definitions */
  parameters: AIFunctionParam[]
  /** Whether this function calls an external API (async) */
  isAsync: boolean
}

export type AIFunctionExecutor = (
  ...args: Array<string | number | boolean | null | (string | number | boolean | null)[][]>
) => string | number | boolean | null

export type AsyncAIFunctionExecutor = (
  ...args: Array<string | number | boolean | null | (string | number | boolean | null)[][]>
) => Promise<string | number | boolean | null>

interface RegisteredAIFunction {
  info: AIFunctionInfo
  executor: AIFunctionExecutor | AsyncAIFunctionExecutor
}

/** Cache entry for async AI function results */
interface CacheEntry {
  value: string | number | boolean | null
  timestamp: number
  key: string
}

/** An async invocation shared by every cell that requested the same result. */
interface PendingCall {
  promise: Promise<string | number | boolean | null>
  cellIds: Set<string>
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
/** Upper bound on cached results — evicted oldest-first once exceeded. */
const DEFAULT_MAX_CACHE_ENTRIES = 500
/** Argument payloads longer than this are hashed rather than stored verbatim. */
const MAX_INLINE_KEY_LENGTH = 256

export class AIFunctionRegistry {
  private _functions: Map<string, RegisteredAIFunction> = new Map()
  private _cache: Map<string, CacheEntry> = new Map()
  /**
   * In-flight calls, keyed by function+args. Multiple cells can share one
   * invocation (e.g. `=AI.CATEGORIZE` filled down a column with repeated
   * values), so each entry tracks every cell awaiting the result.
   */
  private _pendingCalls: Map<string, PendingCall> = new Map()
  private _cacheTtl: number = DEFAULT_CACHE_TTL_MS
  private _maxCacheEntries: number = DEFAULT_MAX_CACHE_ENTRIES
  private _onCellUpdate: ((cellId: string, value: string | number | boolean | null) => void) | null = null

  /** Set the callback that pushes resolved async values back into the sheet */
  setUpdateCallback(cb: (cellId: string, value: string | number | boolean | null) => void) {
    this._onCellUpdate = cb
  }

  /** Set cache TTL in milliseconds */
  setCacheTtl(ms: number) {
    this._cacheTtl = ms
  }

  /**
   * Register a synchronous AI function.
   * Returns a dispose function to unregister.
   */
  registerFunction(info: AIFunctionInfo, executor: AIFunctionExecutor): () => void {
    const name = info.name.toUpperCase()
    this._functions.set(name, { info: { ...info, name, isAsync: false }, executor })
    return () => this.unregister(name)
  }

  /**
   * Register an asynchronous AI function (LLM-backed).
   * Returns a dispose function to unregister.
   */
  registerAsyncFunction(info: AIFunctionInfo, executor: AsyncAIFunctionExecutor): () => void {
    const name = info.name.toUpperCase()
    this._functions.set(name, { info: { ...info, name, isAsync: true }, executor })
    return () => this.unregister(name)
  }

  /** Unregister a function by name */
  unregister(name: string) {
    const key = name.toUpperCase()
    this._functions.delete(key)
    // Clean up cache entries for this function
    for (const [cacheKey] of this._cache) {
      if (cacheKey.startsWith(key + '::')) {
        this._cache.delete(cacheKey)
      }
    }
  }

  /** Check if a function name is a registered AI function */
  has(name: string): boolean {
    return this._functions.has(name.toUpperCase())
  }

  /** Get function info for autocomplete */
  getFunctionInfo(name: string): AIFunctionInfo | null {
    const entry = this._functions.get(name.toUpperCase())
    return entry?.info ?? null
  }

  /** Get all registered AI functions (for autocomplete integration) */
  getAllFunctions(): AIFunctionInfo[] {
    return Array.from(this._functions.values()).map((f) => f.info)
  }

  /**
   * Execute an AI function. For async functions, returns a placeholder immediately
   * and triggers the actual computation in the background. When complete, calls
   * the update callback to push the result into the cell.
   *
   * @param name Function name (e.g., "AI.CATEGORIZE")
   * @param cellId The cell where this formula lives (for async result delivery)
   * @param args The arguments passed to the function
   * @returns Immediate result (sync) or placeholder string (async)
   */
  execute(
    name: string,
    cellId: string,
    args: Array<string | number | boolean | null | (string | number | boolean | null)[][]>,
  ): string | number | boolean | null {
    const key = name.toUpperCase()
    const entry = this._functions.get(key)
    if (!entry) return '#NAME?'

    if (!entry.info.isAsync) {
      // Synchronous execution
      try {
        return (entry.executor as AIFunctionExecutor)(...args)
      } catch (e) {
        console.error(`[AIFunction] Error in ${key}:`, e)
        return '#ERROR!'
      }
    }

    // Async execution — check cache first
    const cacheKey = this._buildCacheKey(key, args)
    const cached = this._cache.get(cacheKey)
    if (cached) {
      if (Date.now() - cached.timestamp < this._cacheTtl) {
        return cached.value
      }
      // Expired — drop it rather than leaving it resident forever
      this._cache.delete(cacheKey)
    }

    // Join an in-flight call for this exact invocation. Every waiting cell must
    // be recorded, otherwise only the first one ever receives the result and
    // the rest stay on the loading placeholder permanently.
    const pending = this._pendingCalls.get(cacheKey)
    if (pending) {
      pending.cellIds.add(cellId)
      return '⏳ Loading...'
    }

    // Fire async call
    const cellIds = new Set<string>([cellId])
    const promise = (entry.executor as AsyncAIFunctionExecutor)(...args)
    this._pendingCalls.set(cacheKey, { promise, cellIds })

    promise
      .then((result) => {
        // Cache the result
        this._setCacheEntry(cacheKey, result)
        // Push the result into every cell that asked for it
        if (this._onCellUpdate) {
          for (const id of cellIds) this._onCellUpdate(id, result)
        }
      })
      .catch((err) => {
        console.error(`[AIFunction] Async error in ${key}:`, err)
        if (this._onCellUpdate) {
          for (const id of cellIds) this._onCellUpdate(id, '#AI_ERROR!')
        }
      })
      .finally(() => {
        this._pendingCalls.delete(cacheKey)
      })

    return '⏳ Loading...'
  }

  /** Invalidate all cached results (e.g., when user changes API key) */
  clearCache() {
    this._cache.clear()
  }

  /** Invalidate cache for a specific function */
  clearFunctionCache(name: string) {
    const key = name.toUpperCase()
    for (const [cacheKey] of this._cache) {
      if (cacheKey.startsWith(key + '::')) {
        this._cache.delete(cacheKey)
      }
    }
  }

  /** Get the number of pending async calls (for UI indicators) */
  getPendingCount(): number {
    return this._pendingCalls.size
  }

  /** Dispose all functions and clear state */
  dispose() {
    this._functions.clear()
    this._cache.clear()
    this._pendingCalls.clear()
    this._onCellUpdate = null
  }

  /**
   * Insert a cache entry, evicting the oldest entries once the cache exceeds
   * its bound. Without this the map grows for the lifetime of the session —
   * filling `=AI.CATEGORIZE` down 5,000 rows would retain 5,000 entries.
   */
  private _setCacheEntry(cacheKey: string, value: string | number | boolean | null): void {
    this._cache.set(cacheKey, { value, key: cacheKey, timestamp: Date.now() })

    if (this._cache.size <= this._maxCacheEntries) return

    // First pass: drop anything already past its TTL.
    const now = Date.now()
    for (const [k, entry] of this._cache) {
      if (now - entry.timestamp >= this._cacheTtl) this._cache.delete(k)
    }

    // Still over budget — evict oldest-first (Map preserves insertion order).
    while (this._cache.size > this._maxCacheEntries) {
      const oldest = this._cache.keys().next()
      if (oldest.done) break
      this._cache.delete(oldest.value)
    }
  }

  private _buildCacheKey(
    funcName: string,
    args: Array<string | number | boolean | null | (string | number | boolean | null)[][]>,
  ): string {
    const argStr = args
      .map((a) => {
        if (a === null) return 'null'
        if (Array.isArray(a)) return JSON.stringify(a)
        return String(a)
      })
      .join('|')
    // Range arguments serialise to very large strings; hash them so the key
    // does not retain a full copy of the referenced cells.
    const suffix = argStr.length > MAX_INLINE_KEY_LENGTH ? `#${hashString(argStr)}` : argStr
    return `${funcName}::${suffix}`
  }
}

/**
 * FNV-1a — a small, fast, non-cryptographic string hash. Used only to keep
 * cache keys compact for large range arguments.
 */
function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36) + ':' + input.length
}

/**
 * Shared registry instance.
 *
 * Prefer `new AIFunctionRegistry()` when you need an isolated lifecycle —
 * `SpreadsheetEngine` owns its own instance so that disposing one engine cannot
 * unregister functions still in use by another.
 */
export const aiFunctionRegistry = new AIFunctionRegistry()
