/**
 * Unit tests for the ONNX ProgressIndicator component logic.
 *
 * Since the test environment is 'node' (no DOM/jsdom), these tests validate:
 * - formatExecutionTime helper for correct time formatting
 * - Store integration for progress state management
 * - Component export availability
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 4.4, 9.4, 1.8
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { formatExecutionTime } from './ProgressIndicator';
import { useOnnxProgressStore } from './progressStore';

describe('formatExecutionTime', () => {
  describe('durations under 60 seconds (Requirement 12.3)', () => {
    it('formats 0ms as "0.0s"', () => {
      expect(formatExecutionTime(0)).toBe('0.0s');
    });

    it('formats 500ms as "0.5s"', () => {
      expect(formatExecutionTime(500)).toBe('0.5s');
    });

    it('formats 2300ms as "2.3s"', () => {
      expect(formatExecutionTime(2300)).toBe('2.3s');
    });

    it('formats 10000ms as "10.0s"', () => {
      expect(formatExecutionTime(10000)).toBe('10.0s');
    });

    it('formats 59999ms as "60.0s" (boundary: rounds up to 60.0 → still under format switch)', () => {
      // 59999ms = 59.999s → rounds to "60.0s" but format is still seconds
      expect(formatExecutionTime(59999)).toBe('60.0s');
    });

    it('formats 59500ms as "59.5s"', () => {
      expect(formatExecutionTime(59500)).toBe('59.5s');
    });

    it('formats 1234ms as "1.2s"', () => {
      expect(formatExecutionTime(1234)).toBe('1.2s');
    });
  });

  describe('durations of 60 seconds or more (Requirement 12.3)', () => {
    it('formats exactly 60000ms as "1m 0.0s"', () => {
      expect(formatExecutionTime(60000)).toBe('1m 0.0s');
    });

    it('formats 72000ms as "1m 12.0s"', () => {
      expect(formatExecutionTime(72000)).toBe('1m 12.0s');
    });

    it('formats 90500ms as "1m 30.5s"', () => {
      expect(formatExecutionTime(90500)).toBe('1m 30.5s');
    });

    it('formats 120000ms as "2m 0.0s"', () => {
      expect(formatExecutionTime(120000)).toBe('2m 0.0s');
    });

    it('formats 125300ms as "2m 5.3s"', () => {
      expect(formatExecutionTime(125300)).toBe('2m 5.3s');
    });

    it('formats 600000ms (10 minutes) as "10m 0.0s"', () => {
      expect(formatExecutionTime(600000)).toBe('10m 0.0s');
    });

    it('formats 3661500ms as "61m 1.5s"', () => {
      expect(formatExecutionTime(3661500)).toBe('61m 1.5s');
    });
  });
});

describe('ProgressIndicator store integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOnnxProgressStore.setState({
      activeInferences: new Map(),
      cacheStatus: { totalMemoryMB: 0, sessionCount: 0 },
      pathIndicator: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Path A indeterminate progress (Requirement 12.5)', () => {
    it('sets progress to -1 for Path A (local) inference', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      const state = useOnnxProgressStore.getState();
      const entry = state.activeInferences.get('A1');
      expect(entry).toBeDefined();
      expect(entry!.progress).toBe(-1);
    });
  });

  describe('Path B determinate progress (Requirement 12.1)', () => {
    it('sets progress to 0 initially for Path B (server) inference', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('B2', 'server');

      const state = useOnnxProgressStore.getState();
      const entry = state.activeInferences.get('B2');
      expect(entry).toBeDefined();
      expect(entry!.progress).toBe(0);
    });

    it('updates progress as chunks arrive', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('B2', 'server');
      store.updateProgress('B2', 25);
      store.updateProgress('B2', 50);
      store.updateProgress('B2', 75);
      store.updateProgress('B2', 100);

      const state = useOnnxProgressStore.getState();
      const entry = state.activeInferences.get('B2');
      expect(entry!.progress).toBe(100);
      expect(entry!.receivedChunks).toBe(4);
    });
  });

  describe('Cancel operation (Requirement 12.2)', () => {
    it('removes inference from active set on cancel', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');
      expect(useOnnxProgressStore.getState().activeInferences.size).toBe(1);

      store.cancelInference('A1');
      expect(useOnnxProgressStore.getState().activeInferences.size).toBe(0);
    });
  });

  describe('Path indicator display (Requirement 4.4)', () => {
    it('shows path indicator for local inference', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      const state = useOnnxProgressStore.getState();
      expect(state.pathIndicator).not.toBeNull();
      expect(state.pathIndicator!.visible).toBe(true);
      expect(state.pathIndicator!.path).toBe('local');
    });

    it('shows path indicator for server inference', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'server');

      const state = useOnnxProgressStore.getState();
      expect(state.pathIndicator!.path).toBe('server');
    });

    it('keeps path indicator visible for minimum 2 seconds', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');
      store.completeInference('A1', 500);

      // Still visible because 2s haven't passed
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      vi.advanceTimersByTime(2000);

      // Now hidden after timer
      expect(useOnnxProgressStore.getState().pathIndicator).toBeNull();
    });
  });

  describe('Cache status display (Requirement 9.4)', () => {
    it('tracks cache memory and session count', () => {
      const store = useOnnxProgressStore.getState();
      store.updateCacheStatus(128.5, 2);

      const state = useOnnxProgressStore.getState();
      expect(state.cacheStatus.totalMemoryMB).toBe(128.5);
      expect(state.cacheStatus.sessionCount).toBe(2);
    });

    it('reflects updated cache status immediately', () => {
      const store = useOnnxProgressStore.getState();
      store.updateCacheStatus(256, 4);
      store.updateCacheStatus(384, 6);

      const state = useOnnxProgressStore.getState();
      expect(state.cacheStatus.totalMemoryMB).toBe(384);
      expect(state.cacheStatus.sessionCount).toBe(6);
    });
  });

  describe('Execution time tracking (Requirement 12.3)', () => {
    it('completeInference removes inference from active set', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');
      store.completeInference('A1', 2300);

      expect(useOnnxProgressStore.getState().activeInferences.size).toBe(0);
    });
  });

  describe('60-second suggestion threshold (Requirement 12.4)', () => {
    it('elapsed time can be computed from startedAt timestamp', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      const state = useOnnxProgressStore.getState();
      const entry = state.activeInferences.get('A1');
      expect(entry!.startedAt).toBe(now);

      // After 60 seconds, elapsed exceeds threshold
      vi.advanceTimersByTime(60000);
      const elapsed = Date.now() - entry!.startedAt;
      expect(elapsed).toBe(60000);
    });
  });
});

describe('ProgressIndicator module exports', () => {
  it('exports ProgressIndicator component', async () => {
    const mod = await import('./ProgressIndicator');
    expect(mod.ProgressIndicator).toBeDefined();
    expect(typeof mod.ProgressIndicator).toBe('function');
  });

  it('exports formatExecutionTime helper', async () => {
    const mod = await import('./ProgressIndicator');
    expect(mod.formatExecutionTime).toBeDefined();
    expect(typeof mod.formatExecutionTime).toBe('function');
  });
});
