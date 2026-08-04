/**
 * Session Cache with LRU Eviction
 *
 * Manages loaded ONNX InferenceSession instances in-browser.
 * Enforces a 512MB memory budget, evicting least-recently-used
 * non-executing sessions when the budget is exceeded.
 *
 * Handles memory pressure signals from the Performance API
 * and supports full disposal on page unload.
 */

import type { SessionCacheEntry } from './types';

/** Default memory budget: 512MB */
const DEFAULT_MAX_MEMORY_BYTES = 512 * 1024 * 1024;

export class SessionCache {
  private cache: Map<string, SessionCacheEntry>;
  private maxMemoryBytes: number;

  constructor(maxMemoryBytes?: number) {
    this.cache = new Map();
    this.maxMemoryBytes = maxMemoryBytes ?? DEFAULT_MAX_MEMORY_BYTES;
  }

  /**
   * Get a session by model hash, updating LRU timestamp.
   * Returns the entry if found, or null if not cached.
   */
  get(hash: string): SessionCacheEntry | null {
    const entry = this.cache.get(hash);
    if (!entry) {
      return null;
    }
    // Update LRU timestamp
    entry.lastUsedAt = Date.now();
    return entry;
  }

  /**
   * Store a session, evicting LRU entries if over budget.
   *
   * Algorithm:
   * 1. Store newSession in cache, update totalMemory
   * 2. WHILE totalMemory > maxMemoryBytes:
   *    a. Find LRU entry WHERE isExecuting === false AND hash !== newHash
   *    b. IF no evictable entry found:
   *       - Remove newSession from cache
   *       - RETURN false (rejection)
   *    c. Dispose session's WASM memory
   *    d. Remove entry from cache
   * 3. RETURN true (success)
   */
  set(hash: string, entry: SessionCacheEntry): boolean {
    this.cache.set(hash, entry);

    if (this.getTotalMemory() > this.maxMemoryBytes) {
      const evicted = this.evictUntilUnderBudget(hash);
      if (!evicted) {
        // Cannot evict enough — all other sessions are executing
        this.cache.delete(hash);
        return false;
      }
    }

    return true;
  }

  /**
   * Evict least-recently-used non-executing sessions until under budget.
   * Public method for explicit eviction triggers.
   */
  evict(): void {
    this.evictUntilUnderBudget();
  }

  /**
   * Evict due to memory pressure signal from the Performance API.
   * Evicts non-executing sessions starting with LRU until pressure is relieved.
   * Since we cannot directly query the Performance API for "no longer under pressure",
   * we evict all non-executing sessions as a conservative approach.
   */
  handleMemoryPressure(): void {
    const evictable = this.getEvictableEntriesSorted();
    for (const entry of evictable) {
      this.disposeSession(entry);
      this.cache.delete(entry.hash);
    }
  }

  /**
   * Dispose all sessions (page unload).
   * Releases all WASM memory. Target: within 2 seconds.
   */
  disposeAll(): void {
    for (const entry of this.cache.values()) {
      this.disposeSession(entry);
    }
    this.cache.clear();
  }

  /**
   * Current total memory usage in bytes across all cached sessions.
   */
  getTotalMemory(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.sizeBytes;
    }
    return total;
  }

  /**
   * Number of loaded sessions in the cache.
   */
  getSessionCount(): number {
    return this.cache.size;
  }

  /**
   * Internal: Evict LRU non-executing sessions until total memory is under budget.
   * Returns true if budget is satisfied, false if eviction is impossible
   * (all remaining sessions are executing or protected).
   *
   * @param excludeHash - Hash of the newly added entry to protect from self-eviction
   */
  private evictUntilUnderBudget(excludeHash?: string): boolean {
    while (this.getTotalMemory() > this.maxMemoryBytes) {
      const lruEntry = this.findLruNonExecuting(excludeHash);
      if (!lruEntry) {
        return false;
      }
      this.disposeSession(lruEntry);
      this.cache.delete(lruEntry.hash);
    }
    return true;
  }

  /**
   * Find the least-recently-used entry that is not currently executing.
   *
   * @param excludeHash - Hash to exclude from eviction candidates (newly added entry)
   */
  private findLruNonExecuting(excludeHash?: string): SessionCacheEntry | null {
    let oldest: SessionCacheEntry | null = null;

    for (const entry of this.cache.values()) {
      if (entry.isExecuting) continue;
      if (excludeHash && entry.hash === excludeHash) continue;
      if (oldest === null || entry.lastUsedAt < oldest.lastUsedAt) {
        oldest = entry;
      }
    }

    return oldest;
  }

  /**
   * Get all evictable (non-executing) entries sorted by lastUsedAt ascending (LRU first).
   */
  private getEvictableEntriesSorted(): SessionCacheEntry[] {
    const evictable: SessionCacheEntry[] = [];
    for (const entry of this.cache.values()) {
      if (!entry.isExecuting) {
        evictable.push(entry);
      }
    }
    evictable.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    return evictable;
  }

  /**
   * Dispose a session's resources (WASM memory).
   * Calls session.release() if available (ort.InferenceSession pattern).
   */
  private disposeSession(entry: SessionCacheEntry): void {
    const session = entry.session as { release?: () => void };
    if (session && typeof session.release === 'function') {
      session.release();
    }
  }
}
