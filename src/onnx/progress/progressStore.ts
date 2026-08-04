/**
 * ONNX Progress Store — Zustand slice for inference progress tracking.
 *
 * Tracks:
 * - Active inferences with origin cell, path, start time, and progress
 * - Cache status (memory + session count) for status bar display
 * - Path indicator (local/server) with minimum 2-second visibility
 *
 * Requirements: 12.1, 12.3, 12.5, 4.4, 9.4
 */

import { create } from 'zustand';
import type { ExecutionPath } from '../types';

export interface InferenceEntry {
  originCell: string;
  path: ExecutionPath;
  startedAt: number;
  /** 0–100 for Path B (chunk-based), -1 for indeterminate (Path A) */
  progress: number;
  totalChunks?: number;
  receivedChunks?: number;
}

export interface CacheStatus {
  totalMemoryMB: number;
  sessionCount: number;
}

export interface PathIndicator {
  visible: boolean;
  path: ExecutionPath | null;
  reason: string;
}

export interface OnnxSlice {
  /** Active inference operations keyed by cell ID */
  activeInferences: Map<string, InferenceEntry>;

  /** Session cache status for status bar (Requirement 9.4) */
  cacheStatus: CacheStatus;

  /** Path indicator display (Requirement 4.4) — shown for min 2 seconds */
  pathIndicator: PathIndicator | null;

  // Actions
  startInference(cellId: string, path: ExecutionPath): void;
  updateProgress(cellId: string, progress: number): void;
  completeInference(cellId: string, timeMs: number): void;
  cancelInference(cellId: string): void;
  updateCacheStatus(memoryMB: number, count: number): void;
}

/**
 * Minimum time (ms) the path indicator remains visible (Requirement 4.4).
 */
const PATH_INDICATOR_MIN_DISPLAY_MS = 2000;

/**
 * Internal timer tracking for path indicator auto-hide.
 * Stored outside store state to avoid serialization issues.
 */
let pathIndicatorTimer: ReturnType<typeof setTimeout> | null = null;

export const useOnnxProgressStore = create<OnnxSlice>()((set, get) => ({
  activeInferences: new Map(),
  cacheStatus: { totalMemoryMB: 0, sessionCount: 0 },
  pathIndicator: null,

  startInference(cellId: string, path: ExecutionPath) {
    const entry: InferenceEntry = {
      originCell: cellId,
      path,
      startedAt: Date.now(),
      progress: path === 'local' ? -1 : 0,
    };

    set((state) => {
      const next = new Map(state.activeInferences);
      next.set(cellId, entry);
      return { activeInferences: next };
    });

    // Show path indicator (Requirement 4.4)
    const reason = path === 'local' ? 'Running locally in browser' : 'Running on server';
    set({ pathIndicator: { visible: true, path, reason } });

    // Clear any existing timer
    if (pathIndicatorTimer !== null) {
      clearTimeout(pathIndicatorTimer);
    }

    // Auto-hide after minimum display time if inference is already done
    pathIndicatorTimer = setTimeout(() => {
      pathIndicatorTimer = null;
      const current = get();
      // Only hide if no active inferences remain (inference completed before timer)
      if (!current.activeInferences.has(cellId)) {
        set({ pathIndicator: null });
      }
    }, PATH_INDICATOR_MIN_DISPLAY_MS);
  },

  updateProgress(cellId: string, progress: number) {
    set((state) => {
      const existing = state.activeInferences.get(cellId);
      if (!existing) return state;

      const next = new Map(state.activeInferences);
      const receivedChunks = (existing.receivedChunks ?? 0) + 1;
      next.set(cellId, {
        ...existing,
        progress: Math.max(0, Math.min(100, progress)),
        receivedChunks,
      });
      return { activeInferences: next };
    });
  },

  completeInference(cellId: string, _timeMs: number) {
    set((state) => {
      const next = new Map(state.activeInferences);
      next.delete(cellId);
      return { activeInferences: next };
    });

    // Hide path indicator if minimum time has elapsed (timer already fired)
    if (pathIndicatorTimer === null) {
      set({ pathIndicator: null });
    }
    // Otherwise the timer callback will handle hiding
  },

  cancelInference(cellId: string) {
    set((state) => {
      const next = new Map(state.activeInferences);
      next.delete(cellId);
      return { activeInferences: next };
    });

    // Hide path indicator if minimum time has elapsed
    if (pathIndicatorTimer === null) {
      set({ pathIndicator: null });
    }
  },

  updateCacheStatus(memoryMB: number, count: number) {
    set({ cacheStatus: { totalMemoryMB: memoryMB, sessionCount: count } });
  },
}));
