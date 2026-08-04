/**
 * Unit tests for the ONNX Progress Store (Zustand slice).
 *
 * Validates inference tracking, cache status updates, path indicator behavior,
 * and the minimum 2-second visibility rule for the path indicator.
 *
 * Requirements: 12.1, 12.3, 12.5, 4.4, 9.4
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useOnnxProgressStore } from './progressStore';

describe('OnnxProgressStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store state between tests
    useOnnxProgressStore.setState({
      activeInferences: new Map(),
      cacheStatus: { totalMemoryMB: 0, sessionCount: 0 },
      pathIndicator: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startInference', () => {
    it('adds an inference entry with local path and indeterminate progress (-1)', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      const state = useOnnxProgressStore.getState();
      expect(state.activeInferences.size).toBe(1);

      const entry = state.activeInferences.get('A1');
      expect(entry).toBeDefined();
      expect(entry!.originCell).toBe('A1');
      expect(entry!.path).toBe('local');
      expect(entry!.progress).toBe(-1);
      expect(entry!.startedAt).toBeGreaterThan(0);
    });

    it('adds an inference entry with server path and progress at 0', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('B2', 'server');

      const state = useOnnxProgressStore.getState();
      const entry = state.activeInferences.get('B2');
      expect(entry).toBeDefined();
      expect(entry!.path).toBe('server');
      expect(entry!.progress).toBe(0);
    });

    it('shows the path indicator with correct path and reason', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('C3', 'local');

      const state = useOnnxProgressStore.getState();
      expect(state.pathIndicator).not.toBeNull();
      expect(state.pathIndicator!.visible).toBe(true);
      expect(state.pathIndicator!.path).toBe('local');
      expect(state.pathIndicator!.reason).toBe('Running locally in browser');
    });

    it('shows server path indicator with appropriate reason', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('D4', 'server');

      const state = useOnnxProgressStore.getState();
      expect(state.pathIndicator!.path).toBe('server');
      expect(state.pathIndicator!.reason).toBe('Running on server');
    });

    it('tracks multiple concurrent inferences', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');
      store.startInference('B2', 'server');

      const state = useOnnxProgressStore.getState();
      expect(state.activeInferences.size).toBe(2);
      expect(state.activeInferences.get('A1')!.path).toBe('local');
      expect(state.activeInferences.get('B2')!.path).toBe('server');
    });
  });

  describe('updateProgress', () => {
    it('updates progress for an active inference', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'server');
      store.updateProgress('A1', 50);

      const state = useOnnxProgressStore.getState();
      expect(state.activeInferences.get('A1')!.progress).toBe(50);
    });

    it('increments receivedChunks on each progress update', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'server');
      store.updateProgress('A1', 25);
      store.updateProgress('A1', 50);

      const state = useOnnxProgressStore.getState();
      expect(state.activeInferences.get('A1')!.receivedChunks).toBe(2);
    });

    it('clamps progress to 0–100 range', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'server');

      store.updateProgress('A1', -10);
      expect(useOnnxProgressStore.getState().activeInferences.get('A1')!.progress).toBe(0);

      store.updateProgress('A1', 150);
      expect(useOnnxProgressStore.getState().activeInferences.get('A1')!.progress).toBe(100);
    });

    it('does nothing for a non-existent inference', () => {
      const store = useOnnxProgressStore.getState();
      store.updateProgress('Z99', 50);

      const state = useOnnxProgressStore.getState();
      expect(state.activeInferences.size).toBe(0);
    });
  });

  describe('completeInference', () => {
    it('removes the inference entry from active inferences', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');
      expect(useOnnxProgressStore.getState().activeInferences.size).toBe(1);

      store.completeInference('A1', 1500);
      expect(useOnnxProgressStore.getState().activeInferences.size).toBe(0);
    });

    it('hides path indicator after min display time when inference completes quickly', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      // Complete before the 2-second minimum
      store.completeInference('A1', 500);

      // Path indicator still visible (timer hasn't fired)
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      // Advance past the 2-second timer
      vi.advanceTimersByTime(2000);

      // Now it should be hidden
      expect(useOnnxProgressStore.getState().pathIndicator).toBeNull();
    });

    it('hides path indicator immediately when inference takes longer than 2 seconds', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'server');

      // Advance past the minimum display time
      vi.advanceTimersByTime(2000);

      // Timer has fired, but inference still active so indicator persists
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      // Now complete — should hide immediately
      store.completeInference('A1', 3000);
      expect(useOnnxProgressStore.getState().pathIndicator).toBeNull();
    });
  });

  describe('cancelInference', () => {
    it('removes the inference entry from active inferences', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'server');
      store.cancelInference('A1');

      expect(useOnnxProgressStore.getState().activeInferences.size).toBe(0);
    });

    it('hides path indicator after min display time on early cancel', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      // Cancel immediately (before 2-second min)
      store.cancelInference('A1');

      // Still visible
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      // Advance timer
      vi.advanceTimersByTime(2000);

      // Now hidden
      expect(useOnnxProgressStore.getState().pathIndicator).toBeNull();
    });

    it('hides path indicator immediately on cancel after 2 seconds', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      // Let minimum time pass
      vi.advanceTimersByTime(2000);

      // Cancel after timer
      store.cancelInference('A1');
      expect(useOnnxProgressStore.getState().pathIndicator).toBeNull();
    });
  });

  describe('updateCacheStatus', () => {
    it('updates cache status with memory and session count', () => {
      const store = useOnnxProgressStore.getState();
      store.updateCacheStatus(256.5, 3);

      const state = useOnnxProgressStore.getState();
      expect(state.cacheStatus.totalMemoryMB).toBe(256.5);
      expect(state.cacheStatus.sessionCount).toBe(3);
    });

    it('updates cache status multiple times reflecting latest values', () => {
      const store = useOnnxProgressStore.getState();
      store.updateCacheStatus(100, 2);
      store.updateCacheStatus(200, 4);

      const state = useOnnxProgressStore.getState();
      expect(state.cacheStatus.totalMemoryMB).toBe(200);
      expect(state.cacheStatus.sessionCount).toBe(4);
    });

    it('handles zero values', () => {
      const store = useOnnxProgressStore.getState();
      store.updateCacheStatus(0, 0);

      const state = useOnnxProgressStore.getState();
      expect(state.cacheStatus.totalMemoryMB).toBe(0);
      expect(state.cacheStatus.sessionCount).toBe(0);
    });
  });

  describe('path indicator timing (Requirement 4.4)', () => {
    it('path indicator remains visible for at least 2 seconds', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      // Advance just under 2 seconds
      vi.advanceTimersByTime(1999);
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      // Advance to exactly 2 seconds (and inference is still active)
      vi.advanceTimersByTime(1);
      // Still visible because inference is active
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();
    });

    it('replacing an inference resets the indicator timer', () => {
      const store = useOnnxProgressStore.getState();
      store.startInference('A1', 'local');

      // Advance 1.5 seconds
      vi.advanceTimersByTime(1500);

      // Start a new inference — resets the timer
      store.startInference('B2', 'server');

      // Complete first one
      store.completeInference('A1', 1500);

      // Advance 1.5 seconds (total 3s from first, 1.5s from second)
      vi.advanceTimersByTime(1500);

      // Path indicator still visible because B2 is active (timer hasn't fired for B2 yet)
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      // Now advance to 2s from second start
      vi.advanceTimersByTime(500);

      // Timer fires, but B2 is still active so indicator stays
      expect(useOnnxProgressStore.getState().pathIndicator).not.toBeNull();

      // Complete B2
      store.completeInference('B2', 2500);
      // Should hide immediately since timer already fired
      expect(useOnnxProgressStore.getState().pathIndicator).toBeNull();
    });
  });
});
