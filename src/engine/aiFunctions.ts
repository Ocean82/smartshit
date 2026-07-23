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

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class AIFunctionRegistry {
  private _functions: Map<string, RegisteredAIFunction> = new Map()
  private _cache: Map<string, CacheEntry> = new Map()
  private _pendingCalls: Map<string, Promise<string | number | boolean | null>> = new Map()
  private _cacheTtl: number = DEFAULT_CACHE_TTL_MS
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
    if (cached && Date.now() - cached.timestamp < this._cacheTtl) {
      return cached.value
    }

    // Check if there's already a pending call for this exact invocation
    if (this._pendingCalls.has(cacheKey)) {
      return '⏳ Loading...'
    }

    // Fire async call
    const promise = (entry.executor as AsyncAIFunctionExecutor)(...args)
    this._pendingCalls.set(cacheKey, promise)

    promise
      .then((result) => {
        // Cache the result
        this._cache.set(cacheKey, {
          value: result,
          key: cacheKey,
          timestamp: Date.now(),
        })
        // Push result into the cell
        if (this._onCellUpdate) {
          this._onCellUpdate(cellId, result)
        }
      })
      .catch((err) => {
        console.error(`[AIFunction] Async error in ${key}:`, err)
        if (this._onCellUpdate) {
          this._onCellUpdate(cellId, '#AI_ERROR!')
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
    return `${funcName}::${argStr}`
  }
}

/** Singleton registry instance */
export const aiFunctionRegistry = new AIFunctionRegistry()
