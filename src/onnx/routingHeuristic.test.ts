import { describe, expect, it } from 'vitest';
import { selectExecutionPath, type RoutingInput } from './routingHeuristic';

const MB = 1024 * 1024;

/** Helper to build a RoutingInput with sensible defaults */
function input(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    cellCount: 100,
    modelSizeBytes: 5 * MB,
    serverReachable: true,
    browserMemoryPressure: false,
    ...overrides,
  };
}

describe('selectExecutionPath', () => {
  describe('user preference override (highest priority)', () => {
    it('selects local when user prefers local regardless of size', () => {
      const result = selectExecutionPath(
        input({ cellCount: 50000, modelSizeBytes: 200 * MB, userPreference: 'local' }),
      );
      expect(result.path).toBe('local');
      expect(result.reason).toBe('user_preference');
      expect(result.isFallback).toBe(false);
    });

    it('selects server when user prefers server regardless of size', () => {
      const result = selectExecutionPath(
        input({ cellCount: 10, modelSizeBytes: 1 * MB, userPreference: 'server' }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('user_preference');
      expect(result.isFallback).toBe(false);
    });

    it('user preference overrides memory pressure', () => {
      const result = selectExecutionPath(
        input({ browserMemoryPressure: true, userPreference: 'local' }),
      );
      expect(result.path).toBe('local');
      expect(result.reason).toBe('user_preference');
      expect(result.isFallback).toBe(false);
    });

    it('user preference overrides server unreachable', () => {
      const result = selectExecutionPath(
        input({ serverReachable: false, userPreference: 'server' }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('user_preference');
      expect(result.isFallback).toBe(false);
    });
  });

  describe('memory pressure detection', () => {
    it('forces server path when memory pressure detected', () => {
      const result = selectExecutionPath(input({ browserMemoryPressure: true }));
      expect(result.path).toBe('server');
      expect(result.reason).toBe('memory_pressure');
      expect(result.isFallback).toBe(true);
    });

    it('forces server even for small datasets under memory pressure', () => {
      const result = selectExecutionPath(
        input({ cellCount: 10, modelSizeBytes: 1 * MB, browserMemoryPressure: true }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('memory_pressure');
    });
  });

  describe('size-based heuristic (Path A for small datasets)', () => {
    it('selects local for cellCount < 5000 AND modelSize < 50MB', () => {
      const result = selectExecutionPath(
        input({ cellCount: 4999, modelSizeBytes: 50 * MB - 1 }),
      );
      expect(result.path).toBe('local');
      expect(result.reason).toBe('small_dataset');
      expect(result.isFallback).toBe(false);
    });

    it('selects server when cellCount >= 5000 (model small)', () => {
      const result = selectExecutionPath(
        input({ cellCount: 5000, modelSizeBytes: 10 * MB }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('large_dataset');
    });

    it('selects server when modelSize >= 50MB (cells small)', () => {
      const result = selectExecutionPath(
        input({ cellCount: 100, modelSizeBytes: 50 * MB }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('large_dataset');
    });

    it('selects server when both cellCount and modelSize exceed thresholds', () => {
      const result = selectExecutionPath(
        input({ cellCount: 10000, modelSizeBytes: 80 * MB }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('large_dataset');
    });

    it('boundary: cellCount exactly 4999 and modelSize exactly under 50MB → local', () => {
      const result = selectExecutionPath(
        input({ cellCount: 4999, modelSizeBytes: 50 * MB - 1 }),
      );
      expect(result.path).toBe('local');
    });
  });

  describe('server unreachable fallback', () => {
    it('falls back to local when server down AND cellCount < 5000 AND modelSize < 100MB', () => {
      const result = selectExecutionPath(
        input({ cellCount: 4000, modelSizeBytes: 60 * MB, serverReachable: false }),
      );
      expect(result.path).toBe('local');
      expect(result.reason).toBe('server_unreachable_fallback');
      expect(result.isFallback).toBe(true);
    });

    it('returns server (error case) when server down AND cellCount >= 5000', () => {
      const result = selectExecutionPath(
        input({ cellCount: 5000, modelSizeBytes: 60 * MB, serverReachable: false }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('large_dataset_server_required');
      expect(result.isFallback).toBe(false);
    });

    it('returns server (error case) when server down AND modelSize >= 100MB', () => {
      const result = selectExecutionPath(
        input({ cellCount: 1000, modelSizeBytes: 100 * MB, serverReachable: false }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('large_dataset_server_required');
      expect(result.isFallback).toBe(false);
    });

    it('returns server (error case) when server down AND both exceed limits', () => {
      const result = selectExecutionPath(
        input({ cellCount: 10000, modelSizeBytes: 200 * MB, serverReachable: false }),
      );
      expect(result.path).toBe('server');
      expect(result.reason).toBe('large_dataset_server_required');
      expect(result.isFallback).toBe(false);
    });

    it('fallback boundary: cellCount 4999 and modelSize 99MB with server down → local fallback', () => {
      const result = selectExecutionPath(
        input({ cellCount: 4999, modelSizeBytes: 99 * MB, serverReachable: false }),
      );
      expect(result.path).toBe('local');
      expect(result.reason).toBe('server_unreachable_fallback');
      expect(result.isFallback).toBe(true);
    });
  });

  describe('performance requirement', () => {
    it('completes routing decision within 200ms', () => {
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        selectExecutionPath(input({ cellCount: i, modelSizeBytes: i * 1000 }));
      }
      const elapsed = performance.now() - start;
      // 10,000 iterations should complete well under 200ms total
      // Each individual call is sub-microsecond
      expect(elapsed).toBeLessThan(200);
    });
  });
});
