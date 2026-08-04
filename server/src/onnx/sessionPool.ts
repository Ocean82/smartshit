/**
 * Server-Side Session Pool
 *
 * Manages a pool of ONNX Runtime Node InferenceSession instances.
 * - Max 10 concurrent sessions with LRU eviction
 * - Load deduplication (concurrent requests for same model share one load)
 * - Request queue with max depth of 50
 * - Idle reaping (dispose sessions unused for 30+ minutes)
 * - Warmup pre-loading of frequently used models
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 3.5, 3.6
 */

import * as ort from 'onnxruntime-node';

export interface SessionPoolConfig {
  maxSessions: number;         // 10
  idleTimeoutMs: number;       // 30 minutes
  maxQueueDepth: number;       // 50
  frequentlyUsedModels: string[];
  /** Function to resolve model name to file path */
  resolveModelPath?: (modelName: string) => string;
}

interface PoolEntry {
  session: ort.InferenceSession;
  modelName: string;
  lastUsedAt: number;
  isActive: boolean;
}

interface QueuedRequest {
  resolve: (session: ort.InferenceSession) => void;
  reject: (error: Error) => void;
}

export class SessionPool {
  private pool: Map<string, PoolEntry> = new Map();
  private pendingLoads: Map<string, Promise<ort.InferenceSession>> = new Map();
  private queuedRequests: QueuedRequest[] = [];
  private reaperInterval: ReturnType<typeof setInterval> | null = null;
  private config: SessionPoolConfig;

  constructor(config: SessionPoolConfig) {
    this.config = config;
  }

  /**
   * Acquire a session for a model, loading on-demand if needed.
   * If the pool is at capacity, evicts the LRU session.
   * If a model is already loading, queues the request and returns the same session.
   * Rejects if request queue exceeds maxQueueDepth.
   */
  async acquire(modelName: string): Promise<ort.InferenceSession> {
    // Check if session is already in the pool
    const existing = this.pool.get(modelName);
    if (existing) {
      existing.lastUsedAt = Date.now();
      existing.isActive = true;
      return existing.session;
    }

    // Check request queue depth
    if (this.queuedRequests.length >= this.config.maxQueueDepth) {
      throw new Error(
        `Server at capacity: ${this.queuedRequests.length} requests queued. Please retry later.`
      );
    }

    // Load deduplication: if already loading this model, wait for the same promise
    if (this.pendingLoads.has(modelName)) {
      const session = await this.pendingLoads.get(modelName)!;
      const entry = this.pool.get(modelName);
      if (entry) {
        entry.lastUsedAt = Date.now();
        entry.isActive = true;
      }
      return session;
    }

    // Load the model on demand
    const loadPromise = this.loadModel(modelName);
    this.pendingLoads.set(modelName, loadPromise);

    try {
      const session = await loadPromise;
      return session;
    } finally {
      this.pendingLoads.delete(modelName);
    }
  }

  /**
   * Release a session back to the pool, updating last-used timestamp.
   */
  release(modelName: string): void {
    const entry = this.pool.get(modelName);
    if (entry) {
      entry.lastUsedAt = Date.now();
      entry.isActive = false;
    }
  }

  /**
   * Pre-load frequently used models on startup (up to max capacity).
   */
  async warmup(): Promise<void> {
    const modelsToLoad = this.config.frequentlyUsedModels.slice(
      0,
      this.config.maxSessions
    );

    const results = await Promise.allSettled(
      modelsToLoad.map(async (modelName) => {
        try {
          await this.loadModel(modelName);
          // Mark as not active after warmup (available for use)
          const entry = this.pool.get(modelName);
          if (entry) {
            entry.isActive = false;
          }
        } catch {
          // Warmup failures are non-fatal — log and continue
        }
      })
    );

    // Clean up any pending load entries from warmup
    for (const modelName of modelsToLoad) {
      this.pendingLoads.delete(modelName);
    }
  }

  /**
   * Dispose sessions unused for more than idleTimeoutMs.
   * Designed to run on a recurring interval.
   */
  reapIdle(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [modelName, entry] of this.pool) {
      if (!entry.isActive && now - entry.lastUsedAt > this.config.idleTimeoutMs) {
        toRemove.push(modelName);
      }
    }

    for (const modelName of toRemove) {
      const entry = this.pool.get(modelName);
      if (entry) {
        entry.session.release();
        this.pool.delete(modelName);
      }
    }
  }

  /**
   * Start the idle reaper on an interval.
   */
  startReaper(intervalMs: number = 60_000): void {
    this.reaperInterval = setInterval(() => this.reapIdle(), intervalMs);
  }

  /**
   * Stop the idle reaper interval.
   */
  stopReaper(): void {
    if (this.reaperInterval) {
      clearInterval(this.reaperInterval);
      this.reaperInterval = null;
    }
  }

  /**
   * Current pool utilization status.
   */
  getStatus(): { loaded: number; active: number; queued: number } {
    let active = 0;
    for (const entry of this.pool.values()) {
      if (entry.isActive) active++;
    }
    return {
      loaded: this.pool.size,
      active,
      queued: this.queuedRequests.length,
    };
  }

  /**
   * Dispose all sessions and clean up resources.
   */
  async dispose(): Promise<void> {
    this.stopReaper();
    for (const [, entry] of this.pool) {
      entry.session.release();
    }
    this.pool.clear();
    this.pendingLoads.clear();

    // Reject any queued requests
    for (const req of this.queuedRequests) {
      req.reject(new Error('Session pool is shutting down'));
    }
    this.queuedRequests = [];
  }

  /**
   * Load a model into the pool, evicting LRU if at capacity.
   */
  private async loadModel(modelName: string): Promise<ort.InferenceSession> {
    // Evict LRU if at capacity
    if (this.pool.size >= this.config.maxSessions) {
      this.evictLRU();
    }

    const modelPath = this.resolveModelPath(modelName);
    const session = await ort.InferenceSession.create(modelPath);

    const entry: PoolEntry = {
      session,
      modelName,
      lastUsedAt: Date.now(),
      isActive: true,
    };

    this.pool.set(modelName, entry);
    return session;
  }

  /**
   * Evict the least-recently-used non-active session from the pool.
   */
  private evictLRU(): void {
    let oldestName: string | null = null;
    let oldestTime = Infinity;

    for (const [modelName, entry] of this.pool) {
      if (!entry.isActive && entry.lastUsedAt < oldestTime) {
        oldestTime = entry.lastUsedAt;
        oldestName = modelName;
      }
    }

    if (oldestName) {
      const entry = this.pool.get(oldestName);
      if (entry) {
        entry.session.release();
        this.pool.delete(oldestName);
      }
    }
  }

  /**
   * Resolve a model name to a file path.
   */
  private resolveModelPath(modelName: string): string {
    if (this.config.resolveModelPath) {
      return this.config.resolveModelPath(modelName);
    }
    return `models/${modelName}.onnx`;
  }
}
