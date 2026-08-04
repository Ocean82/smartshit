/**
 * Unit tests for the Server-Side Session Pool.
 *
 * Uses mocked onnxruntime-node to avoid requiring real ONNX model files.
 * Tests cover: acquire, release, warmup, reapIdle, LRU eviction,
 * load deduplication, request queuing, and timeout behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InferenceSession } from 'onnxruntime-node';

// Mock onnxruntime-node
vi.mock('onnxruntime-node', () => {
  return {
    InferenceSession: {
      create: vi.fn(),
    },
  };
});

import * as ort from 'onnxruntime-node';
import { SessionPool, type SessionPoolConfig } from './sessionPool.js';

function createMockSession(name?: string): InferenceSession {
  return {
    release: vi.fn(),
    inputNames: [],
    outputNames: [],
    run: vi.fn(),
    _name: name,
  } as unknown as InferenceSession;
}

function defaultConfig(overrides?: Partial<SessionPoolConfig>): SessionPoolConfig {
  return {
    maxSessions: 10,
    idleTimeoutMs: 30 * 60 * 1000, // 30 minutes
    maxQueueDepth: 50,
    frequentlyUsedModels: [],
    resolveModelPath: (name) => `models/${name}.onnx`,
    ...overrides,
  };
}

describe('SessionPool', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockCreate = vi.mocked(ort.InferenceSession.create);
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquire', () => {
    it('loads a model on demand when not in pool', async () => {
      const session = createMockSession('test-model');
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig());
      const result = await pool.acquire('test-model');

      expect(result).toBe(session);
      expect(mockCreate).toHaveBeenCalledWith('models/test-model.onnx');
    });

    it('returns cached session without reloading', async () => {
      const session = createMockSession('cached');
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig());
      await pool.acquire('model-a');
      pool.release('model-a');

      const result = await pool.acquire('model-a');
      expect(result).toBe(session);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('marks session as active on acquire', async () => {
      const session = createMockSession();
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig());
      await pool.acquire('my-model');

      const status = pool.getStatus();
      expect(status.active).toBe(1);
      expect(status.loaded).toBe(1);
    });

    it('rejects when request queue exceeds maxQueueDepth', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 1, maxQueueDepth: 2 }));

      mockCreate.mockResolvedValue(createMockSession('model-1'));

      // Fill the pool (1 active session)
      await pool.acquire('model-1');

      // Now all sessions are active — new requests should queue
      // Attach .catch() to suppress unhandled rejection warnings
      const q1 = pool.acquire('model-2').catch(() => {});
      const q2 = pool.acquire('model-3').catch(() => {});

      // Third should reject since queue depth is 2
      await expect(pool.acquire('model-4')).rejects.toThrow('Server at capacity');

      // Clean up
      await pool.dispose();
    });
  });

  describe('release', () => {
    it('marks session as inactive and updates timestamp', async () => {
      const session = createMockSession();
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig());
      await pool.acquire('my-model');

      expect(pool.getStatus().active).toBe(1);

      pool.release('my-model');
      expect(pool.getStatus().active).toBe(0);
    });

    it('drains queued requests after release', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 1 }));

      const session1 = createMockSession('s1');
      const session2 = createMockSession('s2');
      let loadCount = 0;
      mockCreate.mockImplementation(() => {
        loadCount++;
        return Promise.resolve(loadCount === 1 ? session1 : session2);
      });

      // Load first model
      await pool.acquire('model-1');

      // Queue a second request (pool full, all active)
      const secondPromise = pool.acquire('model-2');

      // Release the first — should drain queue and load model-2
      pool.release('model-1');

      const result = await secondPromise;
      expect(result).toBe(session2);
    });
  });

  describe('warmup', () => {
    it('pre-loads frequently used models', async () => {
      const sessions = [createMockSession('a'), createMockSession('b')];
      let callIdx = 0;
      mockCreate.mockImplementation(() => Promise.resolve(sessions[callIdx++]));

      const pool = new SessionPool(
        defaultConfig({ frequentlyUsedModels: ['model-a', 'model-b'] })
      );
      await pool.warmup();

      expect(pool.getStatus().loaded).toBe(2);
      expect(pool.getStatus().active).toBe(0); // marked inactive after warmup
    });

    it('does not exceed maxSessions during warmup', async () => {
      mockCreate.mockImplementation(() => Promise.resolve(createMockSession()));

      const models = Array.from({ length: 15 }, (_, i) => `model-${i}`);
      const pool = new SessionPool(
        defaultConfig({ maxSessions: 10, frequentlyUsedModels: models })
      );
      await pool.warmup();

      expect(pool.getStatus().loaded).toBe(10);
    });

    it('continues loading other models when one fails', async () => {
      let callCount = 0;
      mockCreate.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error('load failed'));
        return Promise.resolve(createMockSession());
      });

      const pool = new SessionPool(
        defaultConfig({ frequentlyUsedModels: ['bad-model', 'good-model'] })
      );
      await pool.warmup();

      // Only good-model should be loaded
      expect(pool.getStatus().loaded).toBe(1);
    });
  });

  describe('reapIdle', () => {
    it('disposes sessions idle for more than idleTimeoutMs', async () => {
      const session = createMockSession();
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig({ idleTimeoutMs: 30 * 60 * 1000 }));
      await pool.acquire('model-x');
      pool.release('model-x');

      // Advance time by 31 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);
      pool.reapIdle();

      expect(pool.getStatus().loaded).toBe(0);
      expect(session.release).toHaveBeenCalled();
    });

    it('does not reap sessions used within timeout', async () => {
      const session = createMockSession();
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig({ idleTimeoutMs: 30 * 60 * 1000 }));
      await pool.acquire('recent-model');
      pool.release('recent-model');

      // Advance only 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);
      pool.reapIdle();

      expect(pool.getStatus().loaded).toBe(1);
      expect(session.release).not.toHaveBeenCalled();
    });

    it('does not reap active sessions even if idle', async () => {
      const session = createMockSession();
      mockCreate.mockResolvedValue(session);

      const pool = new SessionPool(defaultConfig({ idleTimeoutMs: 30 * 60 * 1000 }));
      await pool.acquire('active-model');
      // Do NOT release — session stays active

      vi.advanceTimersByTime(31 * 60 * 1000);
      pool.reapIdle();

      expect(pool.getStatus().loaded).toBe(1);
      expect(session.release).not.toHaveBeenCalled();
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least-recently-used session when pool is at capacity', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 3 }));
      const sessions: InferenceSession[] = [];

      mockCreate.mockImplementation(() => {
        const s = createMockSession();
        sessions.push(s);
        return Promise.resolve(s);
      });

      // Fill pool
      await pool.acquire('model-1');
      pool.release('model-1');
      vi.advanceTimersByTime(100);

      await pool.acquire('model-2');
      pool.release('model-2');
      vi.advanceTimersByTime(100);

      await pool.acquire('model-3');
      pool.release('model-3');
      vi.advanceTimersByTime(100);

      // Acquire a 4th — should evict model-1 (oldest)
      await pool.acquire('model-4');

      expect(pool.getStatus().loaded).toBe(3);
      expect(sessions[0].release).toHaveBeenCalled(); // model-1 evicted
    });

    it('does not evict active sessions', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 2 }));
      const sessions: InferenceSession[] = [];

      mockCreate.mockImplementation(() => {
        const s = createMockSession();
        sessions.push(s);
        return Promise.resolve(s);
      });

      // Load two models, keep first active
      await pool.acquire('model-active');
      // Do not release — stays active

      await pool.acquire('model-inactive');
      pool.release('model-inactive');

      // Load third — should evict model-inactive, not model-active
      await pool.acquire('model-new');

      expect(sessions[1].release).toHaveBeenCalled(); // model-inactive evicted
      expect(sessions[0].release).not.toHaveBeenCalled(); // model-active preserved
    });
  });

  describe('load deduplication', () => {
    it('shares a single load across concurrent requests for the same model', async () => {
      let resolveLoad: (s: InferenceSession) => void;
      const loadPromise = new Promise<InferenceSession>((resolve) => {
        resolveLoad = resolve;
      });
      mockCreate.mockReturnValue(loadPromise);

      const pool = new SessionPool(defaultConfig());

      // Start two concurrent requests for the same model
      const p1 = pool.acquire('shared-model');
      const p2 = pool.acquire('shared-model');

      // Resolve the single load
      const session = createMockSession();
      resolveLoad!(session);

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(session);
      expect(r2).toBe(session);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('request queue', () => {
    it('queues requests when pool is full and all sessions are active', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 1, maxQueueDepth: 5 }));
      const session1 = createMockSession();
      const session2 = createMockSession();
      let loadIdx = 0;
      mockCreate.mockImplementation(() =>
        Promise.resolve(loadIdx++ === 0 ? session1 : session2)
      );

      // Acquire first (fills pool)
      await pool.acquire('model-a');
      // Pool is full and active — next request should queue

      const queuedPromise = pool.acquire('model-b');
      expect(pool.getStatus().queued).toBe(1);

      // Release first — triggers queue drain
      pool.release('model-a');

      const result = await queuedPromise;
      expect(result).toBe(session2);
      expect(pool.getStatus().queued).toBe(0);
    });

    it('rejects requests beyond maxQueueDepth', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 1, maxQueueDepth: 2 }));

      mockCreate.mockResolvedValue(createMockSession());
      await pool.acquire('model-1'); // fills pool, stays active

      // These queue
      pool.acquire('queued-1');
      pool.acquire('queued-2');

      // This one exceeds the queue
      await expect(pool.acquire('overflow')).rejects.toThrow('Server at capacity');
    });
  });

  describe('timeout', () => {
    it('applies shorter timeout for small models', async () => {
      const pool = new SessionPool(
        defaultConfig({
          getModelSize: async () => 50 * 1024 * 1024, // 50MB
        })
      );

      // Create a load that never resolves
      mockCreate.mockImplementation(
        () => new Promise(() => { /* never resolves */ })
      );

      const promise = pool.acquire('slow-model');
      // Suppress unhandled rejection (we assert below)
      promise.catch(() => {});

      // Flush microtasks (for async getModelSize) then advance timers
      await vi.advanceTimersByTimeAsync(11_000);

      await expect(promise).rejects.toThrow('Timeout loading model');
    });

    it('applies longer timeout for large models', async () => {
      const pool = new SessionPool(
        defaultConfig({
          getModelSize: async () => 300 * 1024 * 1024, // 300MB
        })
      );

      mockCreate.mockImplementation(
        () => new Promise(() => { /* never resolves */ })
      );

      const promise = pool.acquire('large-model');
      // Suppress unhandled rejection (we assert below)
      promise.catch(() => {});

      // After 11s, should NOT have timed out (large model gets 60s)
      await vi.advanceTimersByTimeAsync(11_000);

      // Check promise is still pending by racing with a resolved value
      const raceResult = await Promise.race([
        promise.then(() => 'resolved').catch(() => 'rejected'),
        Promise.resolve('pending'),
      ]);
      expect(raceResult).toBe('pending');

      // Advance to 61s total — should timeout
      await vi.advanceTimersByTimeAsync(50_000);

      await expect(promise).rejects.toThrow('Timeout loading model');
    });
  });

  describe('getStatus', () => {
    it('reports accurate pool state', async () => {
      const pool = new SessionPool(defaultConfig());
      mockCreate.mockResolvedValue(createMockSession());

      expect(pool.getStatus()).toEqual({ loaded: 0, active: 0, queued: 0 });

      await pool.acquire('m1');
      expect(pool.getStatus()).toEqual({ loaded: 1, active: 1, queued: 0 });

      await pool.acquire('m2');
      expect(pool.getStatus()).toEqual({ loaded: 2, active: 2, queued: 0 });

      pool.release('m1');
      expect(pool.getStatus()).toEqual({ loaded: 2, active: 1, queued: 0 });
    });
  });

  describe('dispose', () => {
    it('releases all sessions and rejects queued requests', async () => {
      const pool = new SessionPool(defaultConfig({ maxSessions: 1 }));
      const session = createMockSession();
      mockCreate.mockResolvedValue(session);

      await pool.acquire('model-1');

      // Queue a request
      const queuedPromise = pool.acquire('model-2');

      // Dispose the pool
      await pool.dispose();

      expect(session.release).toHaveBeenCalled();
      expect(pool.getStatus()).toEqual({ loaded: 0, active: 0, queued: 0 });
      await expect(queuedPromise).rejects.toThrow('shutting down');
    });
  });
});
