/**
 * ONNX.RUN Initialization Module
 *
 * Wires the ONNX.RUN formula function into the AIFunctionRegistry during
 * application startup. Creates the required OnnxFunctionDeps from actual
 * instances (SessionCache, OnnxWorkerBridge, ModelAssetRegistry, etc.) and
 * registers the function using the same pattern as registerBuiltinAIFunctions.
 *
 * Requirements: 11.1, 6.4
 */

import type { AIFunctionRegistry } from '@/engine/aiFunctions';
import type { ModelAsset, TensorData, InferenceResult } from './types';
import type { OnnxFunctionDeps } from './onnxFormulaFunction';
import type { ModelAssetsAccessor } from './modelAssetRegistry';
import { registerOnnxFunction } from './onnxFormulaFunction';
import { SessionCache } from './sessionCache';
import { OnnxWorkerBridge } from './worker/workerBridge';
import { ModelAssetRegistry } from './modelAssetRegistry';
import { runServerInference } from './sseClientAdapter';

// ─── Shared Instances ─────────────────────────────────────────────────────────

let sessionCache: SessionCache | null = null;
let workerBridge: OnnxWorkerBridge | null = null;
let modelAssetRegistry: ModelAssetRegistry | null = null;

/**
 * Options for initializing the ONNX subsystem.
 * Allows external control over dependencies (useful for testing).
 */
export interface OnnxInitOptions {
  /** Custom ModelAssetsAccessor for reading/writing workbook metadata */
  modelAssetsAccessor?: ModelAssetsAccessor;
  /** Custom SessionCache instance (for testing) */
  sessionCache?: SessionCache;
  /** Custom WorkerBridge instance (for testing) */
  workerBridge?: OnnxWorkerBridge;
  /** Custom function to check server reachability */
  isServerReachable?: () => boolean;
  /** Custom function to check browser memory pressure */
  isBrowserMemoryPressured?: () => boolean;
  /** Custom function to get model binary by hash */
  getModelBinary?: (hash: string) => Promise<ArrayBuffer | null>;
  /** Custom function to check if a cell is occupied */
  isCellOccupied?: (row: number, col: number) => boolean;
  /** Custom function to parse a cell reference */
  parseCellRef?: (cellId: string) => { row: number; col: number } | null;
  /** Custom server inference runner (for testing) */
  runServerInference?: (modelName: string, tensor: TensorData) => Promise<InferenceResult>;
}

/**
 * Default model assets accessor using an in-memory store.
 * In production this is replaced with one backed by the WorkbookData store.
 */
function createDefaultModelAssetsAccessor(): ModelAssetsAccessor {
  let assets: Record<string, ModelAsset> = {};
  return {
    get: () => assets,
    set: (updated) => { assets = updated; },
  };
}

/**
 * Default server reachability check.
 * Returns true optimistically — the routing heuristic handles fallback.
 */
function defaultIsServerReachable(): boolean {
  return true;
}

/**
 * Default browser memory pressure check via Performance API.
 */
function defaultIsBrowserMemoryPressured(): boolean {
  // In environments with performance.measureUserAgentSpecificMemory (Chrome)
  // we could check memory usage, but for now return false optimistically.
  // The routing heuristic handles the fallback case.
  return false;
}

/**
 * Default model binary retrieval (no-op — returns null).
 * In production this would fetch from IndexedDB or a URL.
 */
async function defaultGetModelBinary(_hash: string): Promise<ArrayBuffer | null> {
  return null;
}

/**
 * Default cell occupancy check (no cell is occupied).
 * In production this is wired to the workbook state.
 */
function defaultIsCellOccupied(_row: number, _col: number): boolean {
  return false;
}

/**
 * Default cell reference parser.
 * Parses A1-style references into {row, col} (0-based).
 */
function defaultParseCellRef(cellId: string): { row: number; col: number } | null {
  const match = cellId.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const letters = match[1].toUpperCase();
  const rowNum = parseInt(match[2], 10);
  if (isNaN(rowNum) || rowNum < 1) return null;

  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return { row: rowNum - 1, col: col - 1 };
}

/**
 * Creates a no-op WorkerBridge stub for environments where Worker is unavailable
 * (e.g., Node.js test environments). All operations throw informative errors.
 */
function createNoopWorkerBridge(): OnnxWorkerBridge {
  return {
    loadModel() {
      return Promise.reject(new Error('Web Worker not available in this environment'));
    },
    runInference() {
      return Promise.reject(new Error('Web Worker not available in this environment'));
    },
    terminate() { /* no-op */ },
    getQueueDepth() { return 0; },
  } as unknown as OnnxWorkerBridge;
}

/**
 * Registers the ONNX.RUN formula function in the given AIFunctionRegistry.
 *
 * Creates or reuses shared instances for SessionCache, OnnxWorkerBridge, and
 * ModelAssetRegistry. Returns a cleanup function that unregisters the formula
 * function and disposes shared resources.
 *
 * @param registry - The AIFunctionRegistry to register ONNX.RUN with
 * @param options - Optional overrides for dependencies
 * @returns A dispose function for cleanup on teardown
 */
export function initializeOnnxFunction(
  registry: AIFunctionRegistry,
  options: OnnxInitOptions = {},
): () => void {
  // Create or reuse shared instances
  sessionCache = options.sessionCache ?? new SessionCache();

  // WorkerBridge is constructed at init, but the Web Worker itself is created
  // lazily on first load/infer (see OnnxWorkerBridge). Worker may be missing
  // in Node.js test environments.
  if (options.workerBridge) {
    workerBridge = options.workerBridge;
  } else if (typeof Worker !== 'undefined') {
    workerBridge = new OnnxWorkerBridge();
  } else {
    // No Worker available (Node.js test env) — create a no-op stub
    workerBridge = null;
  }

  const accessor = options.modelAssetsAccessor ?? createDefaultModelAssetsAccessor();
  modelAssetRegistry = new ModelAssetRegistry(accessor);

  // Build the OnnxFunctionDeps object
  const deps: OnnxFunctionDeps = {
    getModelAsset: (name: string) => modelAssetRegistry!.get(name),
    getModelBinary: options.getModelBinary ?? defaultGetModelBinary,
    isCellOccupied: options.isCellOccupied ?? defaultIsCellOccupied,
    parseCellRef: options.parseCellRef ?? defaultParseCellRef,
    sessionCache: sessionCache,
    workerBridge: workerBridge ?? createNoopWorkerBridge(),
    runServerInference: options.runServerInference ?? runServerInference,
    isServerReachable: options.isServerReachable ?? defaultIsServerReachable,
    isBrowserMemoryPressured: options.isBrowserMemoryPressured ?? defaultIsBrowserMemoryPressured,
  };

  // Register ONNX.RUN in the formula engine
  const unregister = registerOnnxFunction(registry, deps);

  // Return combined cleanup function
  return () => {
    unregister();

    // Dispose worker bridge
    if (workerBridge) {
      workerBridge.terminate();
      workerBridge = null;
    }

    // Dispose session cache
    if (sessionCache) {
      sessionCache.disposeAll();
      sessionCache = null;
    }

    modelAssetRegistry = null;
  };
}

// ─── Accessors for shared instances ───────────────────────────────────────────

/** Get the shared SessionCache instance (null if not initialized) */
export function getSessionCache(): SessionCache | null {
  return sessionCache;
}

/** Get the shared OnnxWorkerBridge instance (null if not initialized) */
export function getWorkerBridge(): OnnxWorkerBridge | null {
  return workerBridge;
}

/** Get the shared ModelAssetRegistry instance (null if not initialized) */
export function getModelAssetRegistry(): ModelAssetRegistry | null {
  return modelAssetRegistry;
}
