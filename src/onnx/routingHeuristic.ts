/**
 * Routing Heuristic — Path Selection Logic
 *
 * Determines whether ONNX inference should run in-browser (Path A / 'local')
 * or on the server (Path B / 'server') based on dataset size, model size,
 * user preference, memory pressure, and server reachability.
 *
 * Priority order:
 * 1. User preference override (highest)
 * 2. Browser memory pressure → force server
 * 3. Size-based heuristic (cellCount < 5000 AND modelSize < 50MB → local)
 * 4. Large dataset → server (with fallback logic when server unreachable)
 */

import type { ExecutionPath, RoutingDecision } from './types';

/** Threshold constants */
const SMALL_CELL_COUNT_LIMIT = 5000;
const SMALL_MODEL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const FALLBACK_MODEL_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

export interface RoutingInput {
  cellCount: number;
  modelSizeBytes: number;
  userPreference?: ExecutionPath;
  serverReachable: boolean;
  browserMemoryPressure: boolean;
}

/**
 * Selects the optimal execution path for ONNX inference.
 *
 * Decision logic is deterministic and completes well within 200ms
 * (pure computation with no I/O).
 */
export function selectExecutionPath(input: RoutingInput): RoutingDecision {
  // 1. User override takes precedence
  if (input.userPreference) {
    return { path: input.userPreference, reason: 'user_preference', isFallback: false };
  }

  // 2. Memory pressure forces server
  if (input.browserMemoryPressure) {
    return { path: 'server', reason: 'memory_pressure', isFallback: true };
  }

  // 3. Size-based heuristic
  const isSmall =
    input.cellCount < SMALL_CELL_COUNT_LIMIT &&
    input.modelSizeBytes < SMALL_MODEL_SIZE_BYTES;

  if (isSmall) {
    return { path: 'local', reason: 'small_dataset', isFallback: false };
  }

  // 4. Large dataset → server (with fallback logic)
  if (!input.serverReachable) {
    const canFallbackToLocal =
      input.cellCount < SMALL_CELL_COUNT_LIMIT &&
      input.modelSizeBytes < FALLBACK_MODEL_SIZE_BYTES;

    if (canFallbackToLocal) {
      return { path: 'local', reason: 'server_unreachable_fallback', isFallback: true };
    }

    // Cannot run locally either — will produce error downstream
    return { path: 'server', reason: 'large_dataset_server_required', isFallback: false };
  }

  return { path: 'server', reason: 'large_dataset', isFallback: false };
}
