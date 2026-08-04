import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SessionCache } from './sessionCache';
import type { SessionCacheEntry } from './types';

const MB = 1024 * 1024;

/** Helper to create a mock session entry */
function createEntry(overrides: Partial<SessionCacheEntry> = {}): SessionCacheEntry {
  return {
    hash: `hash_${Math.random().toString(36).slice(2)}`,
    session: { release: vi.fn() },
    sizeBytes: 50 * MB,
    lastUsedAt: Date.now(),
    isExecuting: false,
    ...overrides,
  };
}

describe('SessionCache', () => {
  let cache: SessionCache;

  beforeEach(() => {
    cache = new SessionCache();
  });

  describe('get(hash)', () => {
    it('returns null for non-existent hash', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('returns the entry when found', () => {
      const entry = createEntry({ hash: 'model_a' });
      cache.set('model_a', entry);

      const result = cache.get('model_a');
      expect(result).not.toBeNull();
      expect(result!.hash).toBe('model_a');
      expect(result!.session).toBe(entry.session);
    });

    it('updates the LRU timestamp on access', () => {
      const entry = createEntry({ hash: 'model_a', lastUsedAt: 1000 });
      cache.set('model_a', entry);

      const before = Date.now();
      const result = cache.get('model_a');
      const after = Date.now();

      expect(result!.lastUsedAt).toBeGreaterThanOrEqual(before);
      expect(result!.lastUsedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('set(hash, entry)', () => {
    it('stores an entry and increments session count', () => {
      const entry = createEntry({ hash: 'model_a', sizeBytes: 100 * MB });
      const result = cache.set('model_a', entry);

      expect(result).toBe(true);
      expect(cache.getSessionCount()).toBe(1);
      expect(cache.getTotalMemory()).toBe(100 * MB);
    });

    it('overwrites existing entry with same hash', () => {
      const entry1 = createEntry({ hash: 'model_a', sizeBytes: 100 * MB });
      const entry2 = createEntry({ hash: 'model_a', sizeBytes: 200 * MB });

      cache.set('model_a', entry1);
      cache.set('model_a', entry2);

      expect(cache.getSessionCount()).toBe(1);
      expect(cache.getTotalMemory()).toBe(200 * MB);
    });

    it('triggers eviction when memory exceeds 512MB', () => {
      // Fill cache to near limit
      const oldEntry = createEntry({ hash: 'old_model', sizeBytes: 400 * MB, lastUsedAt: 1000 });
      cache.set('old_model', oldEntry);

      // Adding new entry pushes over 512MB
      const newEntry = createEntry({ hash: 'new_model', sizeBytes: 200 * MB, lastUsedAt: 2000 });
      const result = cache.set('new_model', newEntry);

      expect(result).toBe(true);
      expect(cache.getTotalMemory()).toBeLessThanOrEqual(512 * MB);
      // Old entry should have been evicted
      expect(cache.get('old_model')).toBeNull();
      expect(cache.get('new_model')).not.toBeNull();
    });

    it('evicts LRU entries first (not MRU)', () => {
      // Add entries with increasing timestamps (older = lower timestamp)
      const oldest = createEntry({ hash: 'oldest', sizeBytes: 200 * MB, lastUsedAt: 1000 });
      const middle = createEntry({ hash: 'middle', sizeBytes: 200 * MB, lastUsedAt: 2000 });
      const newest = createEntry({ hash: 'newest', sizeBytes: 200 * MB, lastUsedAt: 3000 });

      cache.set('oldest', oldest);
      cache.set('middle', middle);

      // This will push over 512MB — should evict 'oldest' first
      const result = cache.set('newest', newest);

      expect(result).toBe(true);
      expect(cache.get('oldest')).toBeNull(); // evicted (LRU)
      expect(cache.get('middle')).not.toBeNull(); // kept
      expect(cache.get('newest')).not.toBeNull(); // just added
    });

    it('rejects when all sessions are executing and memory exceeded', () => {
      const executing = createEntry({
        hash: 'executing_model',
        sizeBytes: 500 * MB,
        isExecuting: true,
        lastUsedAt: 1000,
      });
      cache.set('executing_model', executing);

      // Try to add a session that would exceed budget
      const newEntry = createEntry({ hash: 'new_model', sizeBytes: 100 * MB });
      const result = cache.set('new_model', newEntry);

      expect(result).toBe(false);
      expect(cache.get('new_model')).toBeNull();
      // Executing session should still be there
      expect(cache.get('executing_model')).not.toBeNull();
    });

    it('does not evict executing sessions', () => {
      const executing = createEntry({
        hash: 'executing',
        sizeBytes: 300 * MB,
        isExecuting: true,
        lastUsedAt: 1000,
      });
      const idle = createEntry({
        hash: 'idle',
        sizeBytes: 200 * MB,
        isExecuting: false,
        lastUsedAt: 2000,
      });

      cache.set('executing', executing);
      cache.set('idle', idle);

      // Add entry that pushes over budget
      const newEntry = createEntry({ hash: 'new', sizeBytes: 100 * MB, lastUsedAt: 3000 });
      cache.set('new', newEntry);

      // Idle should be evicted, executing preserved
      expect(cache.get('executing')).not.toBeNull();
      expect(cache.get('idle')).toBeNull();
    });
  });

  describe('evict()', () => {
    it('does nothing when under budget', () => {
      const entry = createEntry({ hash: 'small', sizeBytes: 10 * MB });
      cache.set('small', entry);
      cache.evict();

      expect(cache.getSessionCount()).toBe(1);
    });
  });

  describe('handleMemoryPressure()', () => {
    it('evicts all non-executing sessions', () => {
      const idle1 = createEntry({ hash: 'idle1', sizeBytes: 100 * MB, isExecuting: false });
      const idle2 = createEntry({ hash: 'idle2', sizeBytes: 100 * MB, isExecuting: false });
      const executing = createEntry({ hash: 'exec', sizeBytes: 100 * MB, isExecuting: true });

      cache.set('idle1', idle1);
      cache.set('idle2', idle2);
      cache.set('exec', executing);

      cache.handleMemoryPressure();

      expect(cache.get('idle1')).toBeNull();
      expect(cache.get('idle2')).toBeNull();
      expect(cache.get('exec')).not.toBeNull();
      expect(cache.getSessionCount()).toBe(1);
    });

    it('calls release() on evicted sessions', () => {
      const releaseFn = vi.fn();
      const idle = createEntry({
        hash: 'idle',
        sizeBytes: 100 * MB,
        session: { release: releaseFn },
        isExecuting: false,
      });
      cache.set('idle', idle);

      cache.handleMemoryPressure();

      expect(releaseFn).toHaveBeenCalledOnce();
    });

    it('does nothing when all sessions are executing', () => {
      const exec1 = createEntry({ hash: 'exec1', sizeBytes: 200 * MB, isExecuting: true });
      const exec2 = createEntry({ hash: 'exec2', sizeBytes: 200 * MB, isExecuting: true });

      cache.set('exec1', exec1);
      cache.set('exec2', exec2);

      cache.handleMemoryPressure();

      expect(cache.getSessionCount()).toBe(2);
      expect(cache.getTotalMemory()).toBe(400 * MB);
    });
  });

  describe('disposeAll()', () => {
    it('removes all sessions and releases memory', () => {
      const release1 = vi.fn();
      const release2 = vi.fn();
      const entry1 = createEntry({ hash: 'a', session: { release: release1 }, sizeBytes: 100 * MB });
      const entry2 = createEntry({ hash: 'b', session: { release: release2 }, sizeBytes: 200 * MB });

      cache.set('a', entry1);
      cache.set('b', entry2);

      cache.disposeAll();

      expect(cache.getSessionCount()).toBe(0);
      expect(cache.getTotalMemory()).toBe(0);
      expect(release1).toHaveBeenCalledOnce();
      expect(release2).toHaveBeenCalledOnce();
    });

    it('handles sessions without release method gracefully', () => {
      const entry = createEntry({ hash: 'no_release', session: {}, sizeBytes: 50 * MB });
      cache.set('no_release', entry);

      expect(() => cache.disposeAll()).not.toThrow();
      expect(cache.getSessionCount()).toBe(0);
    });

    it('clears executing sessions too', () => {
      const entry = createEntry({ hash: 'exec', isExecuting: true, sizeBytes: 300 * MB });
      cache.set('exec', entry);

      cache.disposeAll();

      expect(cache.getSessionCount()).toBe(0);
      expect(cache.getTotalMemory()).toBe(0);
    });
  });

  describe('getTotalMemory()', () => {
    it('returns 0 for empty cache', () => {
      expect(cache.getTotalMemory()).toBe(0);
    });

    it('sums all session sizes', () => {
      cache.set('a', createEntry({ hash: 'a', sizeBytes: 100 * MB }));
      cache.set('b', createEntry({ hash: 'b', sizeBytes: 150 * MB }));

      expect(cache.getTotalMemory()).toBe(250 * MB);
    });
  });

  describe('getSessionCount()', () => {
    it('returns 0 for empty cache', () => {
      expect(cache.getSessionCount()).toBe(0);
    });

    it('returns correct count after adds', () => {
      cache.set('a', createEntry({ hash: 'a', sizeBytes: 10 * MB }));
      cache.set('b', createEntry({ hash: 'b', sizeBytes: 10 * MB }));
      cache.set('c', createEntry({ hash: 'c', sizeBytes: 10 * MB }));

      expect(cache.getSessionCount()).toBe(3);
    });
  });

  describe('custom max memory', () => {
    it('respects custom memory limit', () => {
      const smallCache = new SessionCache(100 * MB);
      const entry1 = createEntry({ hash: 'a', sizeBytes: 60 * MB, lastUsedAt: 1000 });
      const entry2 = createEntry({ hash: 'b', sizeBytes: 60 * MB, lastUsedAt: 2000 });

      smallCache.set('a', entry1);
      smallCache.set('b', entry2);

      // Should have evicted 'a' to stay under 100MB
      expect(smallCache.get('a')).toBeNull();
      expect(smallCache.get('b')).not.toBeNull();
      expect(smallCache.getTotalMemory()).toBeLessThanOrEqual(100 * MB);
    });
  });
});
