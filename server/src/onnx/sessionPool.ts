/**
 * Server-Side Session Pool
 *
 * Manages a pool of ONNX Runtime Node InferenceSession instances.
 * - Max 10 concurrent sessions with LRU eviction
 * - Load deduplication (concurrent requests for same model share one load)
 * - Request queue with max depth of 50
 * - Idle reaping (dispose sessions unused for 30+ minutes)
 * - Warmup pre-loading of frequently used models
 * - Timeout enforcement: 10s for models < 200MB, 60s for 200–500MB
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 3.5, 3.6
 */

import * as ort from 'onnxruntime-node';

export interface SessionPoolConfig {
  maxSessions: number; // 10
  idleTimeoutMs: number; // 30 minutes (1_800_000)
  maxQueueDepth: number; // 50
  frequentlyUsedModels: string[];
  /** Function to resolve model name to file path */
  resolveModelPath?: (modelName: string) => string;
  /** Function to get model file size in bytes (for timeout calculation) */
  getModelSize?: (modelName: string) => Promise<number>;
}

export interface PoolEntry {
  session: ort.InferenceSession;
  modelName: string;
  lastUsedAt: number;
  isActive: boolean;
}

interface QueuedRequest {
  modelName: string;
  resolve: (session: ort.InferenceSession) => void;
  reject: (error: Error) => void;
}

/** Default timeout for models under 200MB */
const SMALL_MODEL_TIMEOUT_MS = 10_000;
/** Default timeout for models 200MB–500MB */
const LARGE_MODEL_TIMEOUT_MS = 60_000;
/** Threshold for "large" model in bytes (200MB) */
const LARGE_MODEL_THRESHOLD = 200 * 1024 * 1024;

export class SessionPool {
  private pool: Map<string, PoolEntry> = new Map();
  private pendingLoads: Map<string, Promise<ort.InferenceSession>> = new Map();
  private requestQueue: QueuedRequest[] = [];
  private reaperInterval: ReturnType<typeof setInterval> | null = null;
  private config: SessionPoolConfig;

  constructor(config: SessionPoolConfig) {
    this.config = config;
  }

  /**
   * Acquire a session for a model, loading on-demand if needed.
   * If the pool is at capacity, evicts the LRU non-active session.
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
    if (this.requestQueue.length >= this.config.maxQueueDepth) {
      throw new Error(
        `Server at capacity: ${this.requestQueue.length} requests queued. Please retry later.`
      );
    }

    // Load deduplication: if already loading this model, wait for the same promise
    if (this.pendingLoads.has(modelName)) {
      return this.waitForPendingLoad(modelName);
    }

    // Check if we can load now (pool has space or can evict)
    if (this.pool.size >= this.config.maxSessions && !this.canEvict()) {
      // All sessions are active — queue the request
      return this.enqueueRequest(modelName);
    }

    // Load the model on demand
    return this.initiateLoad(modelName);
  }

  /**
   * Release a session back to the pool, updating last-used timestamp.
   * Also drains queued requests if any are waiting.
   */
  release(modelName: string): void {
    const entry = this.pool.get(modelName);
    if (entry) {
      entry.lastUsedAt = Date.now();
      entry.isActive = false;
    }

    // Attempt to drain the queue
    this.drainQueue();
  }

  /**
   * Pre-load frequently used models on startup (up to max capacity).
   */
  async warmup(): Promise<void> {
    const modelsToLoad = this.config.frequentlyUsedModels.slice(
      0,
      this.config.maxSessions
    );

    await Promise.allSettled(
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
      queued: this.requestQueue.length,
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
    for (const req of this.requestQueue) {
      req.reject(new Error('Session pool is shutting down'));
    }
    this.requestQueue = [];
  }

  // ─── Internal API (exposed for testing) ────────────────────────────────

  /** Expose pool for testing purposes */
  get _pool(): Map<string, PoolEntry> {
    return this.pool;
  }

  /** Expose request queue for testing purposes */
  get _requestQueue(): QueuedRequest[] {
    return this.requestQueue;
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  /**
   * Wait for an already-pending load to complete, then mark the session as active.
   */
  private async waitForPendingLoad(modelName: string): Promise<ort.InferenceSession> {
    const session = await this.pendingLoads.get(modelName)!;
    const entry = this.pool.get(modelName);
    if (entry) {
      entry.lastUsedAt = Date.now();
      entry.isActive = true;
    }
    return session;
  }

  /**
   * Enqueue a request when the pool is full and all sessions are active.
   */
  private enqueueRequest(modelName: string): Promise<ort.InferenceSession> {
    return new Promise<ort.InferenceSession>((resolve, reject) => {
      this.requestQueue.push({ modelName, resolve, reject });
    });
  }

  /**
   * Start loading a model and track it in pendingLoads.
   */
  private async initiateLoad(modelName: string): Promise<ort.InferenceSession> {
    const loadPromise = this.loadModel(modelName);
    // Suppress unhandled rejection on the stored reference (callers handle errors via await)
    loadPromise.catch(() => {});
    this.pendingLoads.set(modelName, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.pendingLoads.delete(modelName);
    }
  }

  /**
   * Drain pending queued requests when sessions become available.
   */
  private drainQueue(): void {
    while (this.requestQueue.length > 0) {
      const next = this.requestQueue[0];

      // If the requested model is already loaded, serve directly
      const existing = this.pool.get(next.modelName);
      if (existing) {
        this.requestQueue.shift();
        existing.lastUsedAt = Date.now();
        existing.isActive = true;
        next.resolve(existing.session);
        continue;
      }

      // If we can load (pool has space or can evict), initiate load
      if (this.pool.size < this.config.maxSessions || this.canEvict()) {
        this.requestQueue.shift();
        this.initiateLoad(next.modelName)
          .then((session) => next.resolve(session))
          .catch((err) => next.reject(err));
        continue;
      }

      // Can't do anything yet — stop draining
      break;
    }
  }

  /**
   * Check if there's at least one non-active session that can be evicted.
   */
  private canEvict(): boolean {
    for (const entry of this.pool.values()) {
      if (!entry.isActive) return true;
    }
    return false;
  }

  /**
   * Load a model into the pool, evicting LRU if at capacity.
   * Applies timeout based on model size.
   */
  private async loadModel(modelName: string): Promise<ort.InferenceSession> {
    // Evict LRU if at capacity
    if (this.pool.size >= this.config.maxSessions) {
      this.evictLRU();
    }

    const modelPath = this.resolveModelPath(modelName);

    // Determine timeout based on model size
    const timeoutMs = await this.getLoadTimeout(modelName);

    const session = await this.loadWithTimeout(modelPath, timeoutMs, modelName);

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
   * Load an InferenceSession with a timeout constraint.
   */
  private loadWithTimeout(
    modelPath: string,
    timeoutMs: number,
    modelName: string
  ): Promise<ort.InferenceSession> {
    return new Promise<ort.InferenceSession>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timeout loading model "${modelName}": exceeded ${timeoutMs}ms limit`
          )
        );
      }, timeoutMs);

      ort.InferenceSession.create(modelPath)
        .then((session: ort.InferenceSession) => {
          clearTimeout(timer);
          resolve(session);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Determine the appropriate load timeout based on model size.
   * - Models < 200MB: 10 seconds
   * - Models 200MB–500MB: 60 seconds
   */
  private async getLoadTimeout(modelName: string): Promise<number> {
    if (!this.config.getModelSize) {
      return SMALL_MODEL_TIMEOUT_MS;
    }

    try {
      const sizeBytes = await this.config.getModelSize(modelName);
      return sizeBytes >= LARGE_MODEL_THRESHOLD
        ? LARGE_MODEL_TIMEOUT_MS
        : SMALL_MODEL_TIMEOUT_MS;
    } catch {
      // If we can't determine size, use the smaller timeout
      return SMALL_MODEL_TIMEOUT_MS;
    }
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
   * Default is a flat path: models/{name}.onnx (no fs checks in this layer).
   * Prefer injecting resolveModelPath at mount time (see index.ts + modelPaths.ts).
   */
  private resolveModelPath(modelName: string): string {
    if (this.config.resolveModelPath) {
      return this.config.resolveModelPath(modelName);
    }
    // Lazy import avoided: keep sync default without fs — mount wiring uses modelPaths.
    return `models/${modelName}.onnx`;
  }
}
