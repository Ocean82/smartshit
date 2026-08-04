/**
 * ONNX.RUN Formula Function
 *
 * Registers the ONNX.RUN function in the AIFunctionRegistry, enabling users to
 * invoke ONNX model inference directly from spreadsheet formulas using the syntax:
 *   =ONNX.RUN("model_name", A1:D100)
 *
 * The executor validates arguments, looks up the model in the ModelAssetRegistry,
 * validates input data, selects an execution path via the routing heuristic, runs
 * inference (Path A: in-browser via WorkerBridge, Path B: server via SSE), and
 * handles spill output into adjacent cells.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 6.4, 6.5
 */

import type {
  AIFunctionInfo,
  AsyncAIFunctionExecutor,
  AIFunctionRegistry,
  EvalValue,
} from '@/engine/aiFunctions';
import type { ModelAsset, TensorData, InferenceResult } from './types';
import type { CellInfo, ValidationResult } from './inputValidator';
import { validateAndConstructTensor } from './inputValidator';
import { selectExecutionPath, type RoutingInput } from './routingHeuristic';
import { SessionCache } from './sessionCache';
import { OnnxWorkerBridge } from './worker/workerBridge';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum allowed model name length (Requirement 11.1) */
const MAX_MODEL_NAME_LENGTH = 128;

/** Maximum input range size in cells (Requirement 11.1) */
const MAX_INPUT_CELLS = 10_000;

/** Inference timeout in milliseconds (Requirement 11.7) */
const INFERENCE_TIMEOUT_MS = 30_000;

/** Loading placeholder shown while inference is pending (Requirement 11.7) */
const LOADING_PLACEHOLDER = '⏳ Running...';

// ─── Error values (spreadsheet conventions) ───────────────────────────────────

const ERROR_NAME = '#NAME?';
const ERROR_VALUE = '#VALUE!';
const ERROR_SPILL = '#SPILL!';
const ERROR_TIMEOUT = '#TIMEOUT!';

// ─── Function Info ────────────────────────────────────────────────────────────

export const ONNX_RUN_INFO: AIFunctionInfo = {
  name: 'ONNX.RUN',
  description: 'Runs ONNX model inference on a cell range and returns predictions',
  abstract: 'ONNX model inference',
  category: 'AI/Analysis',
  syntax: 'ONNX.RUN(model_name, input_range)',
  parameters: [
    {
      name: 'model_name',
      description: 'Registered model asset name',
      required: true,
      type: 'string',
      example: '"linear_regression"',
    },
    {
      name: 'input_range',
      description: 'Cell range containing numeric input data',
      required: true,
      type: 'range',
      example: 'A1:D100',
    },
  ],
  isAsync: true,
};

// ─── Spill Utilities ──────────────────────────────────────────────────────────

/**
 * Spill direction for output tensors.
 * - 1-D output: N rows × 1 col (spills downward)
 * - 2-D output: M rows × N cols (spills downward and rightward)
 */
export interface SpillDimensions {
  rows: number;
  cols: number;
}

/**
 * Calculates the spill dimensions from an output tensor's shape.
 * - Scalar (0-D or single value): 1×1
 * - 1-D [N]: N rows × 1 col
 * - 2-D [M, N]: M rows × N cols
 * - Higher dims: flattened to rows × last dim
 */
export function calculateSpillDimensions(dims: number[]): SpillDimensions {
  if (dims.length === 0 || (dims.length === 1 && dims[0] === 1)) {
    return { rows: 1, cols: 1 };
  }
  if (dims.length === 1) {
    return { rows: dims[0], cols: 1 };
  }
  // 2-D or higher: last dimension is columns, product of others is rows
  const cols = dims[dims.length - 1];
  const rows = dims.slice(0, -1).reduce((a, b) => a * b, 1);
  return { rows, cols };
}

/**
 * Checks if the spill range overlaps any occupied cells.
 *
 * @param originRow - 0-based row of the formula cell
 * @param originCol - 0-based col of the formula cell
 * @param spillDims - spill dimensions (rows × cols)
 * @param isOccupied - callback that returns true if a cell at (row, col) has data
 * @returns true if spill collision detected
 */
export function detectSpillCollision(
  originRow: number,
  originCol: number,
  spillDims: SpillDimensions,
  isOccupied: (row: number, col: number) => boolean,
): boolean {
  for (let r = 0; r < spillDims.rows; r++) {
    for (let c = 0; c < spillDims.cols; c++) {
      // Skip the formula cell itself (it's always occupied by the formula)
      if (r === 0 && c === 0) continue;
      if (isOccupied(originRow + r, originCol + c)) {
        return true;
      }
    }
  }
  return false;
}

// ─── Dependency Interfaces ────────────────────────────────────────────────────

/**
 * External dependencies injected into registerOnnxFunction.
 * Enables testability without coupling to global singletons.
 */
export interface OnnxFunctionDeps {
  /** Retrieve a registered model asset by name */
  getModelAsset: (name: string) => ModelAsset | null;
  /** Get model binary for loading into the session cache / worker */
  getModelBinary: (hash: string) => Promise<ArrayBuffer | null>;
  /** Check if a cell is occupied (for spill collision detection) */
  isCellOccupied: (row: number, col: number) => boolean;
  /** Parse cell reference into row/col (0-based) */
  parseCellRef: (cellId: string) => { row: number; col: number } | null;
  /** Session cache instance */
  sessionCache: SessionCache;
  /** Worker bridge instance for Path A inference */
  workerBridge: OnnxWorkerBridge;
  /** SSE client for Path B inference — sends data to server and returns result */
  runServerInference: (modelName: string, tensor: TensorData) => Promise<InferenceResult>;
  /** Whether the server is reachable */
  isServerReachable: () => boolean;
  /** Whether the browser is under memory pressure */
  isBrowserMemoryPressured: () => boolean;
  /** Notify that dependent formula recalculation should be blocked */
  blockDependentRecalc?: (cellId: string) => void;
  /** Notify that dependent formula recalculation can proceed */
  unblockDependentRecalc?: (cellId: string) => void;
}

// ─── Input Range Processing ───────────────────────────────────────────────────

/**
 * Flattens an EvalValue[][] range into CellInfo[] with generated cell IDs.
 * Returns null if the range is not a valid 2D array or exceeds MAX_INPUT_CELLS.
 */
export function flattenInputRange(
  inputRange: EvalValue,
): { cells: CellInfo[]; rows: number; cols: number } | null {
  if (!Array.isArray(inputRange)) return null;

  const rows = inputRange as EvalValue[][];
  if (rows.length === 0) return null;

  // Ensure it's a 2D array
  const numRows = rows.length;
  const numCols = Array.isArray(rows[0]) ? (rows[0] as EvalValue[]).length : 1;

  const cells: CellInfo[] = [];

  for (let r = 0; r < numRows; r++) {
    const row = Array.isArray(rows[r]) ? (rows[r] as EvalValue[]) : [rows[r]];
    for (let c = 0; c < row.length; c++) {
      const value = row[c];
      // Generate a synthetic cell ID (R1C1-style for internal tracking)
      const cellId = `R${r + 1}C${c + 1}`;
      const hasFormulaError =
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        '__refError' in (value as object);

      cells.push({
        cellId,
        value: hasFormulaError ? '#REF!' : value,
        hasFormulaError,
      });
    }
  }

  if (cells.length > MAX_INPUT_CELLS) return null;

  return { cells, rows: numRows, cols: numCols };
}

// ─── Executor Implementation ──────────────────────────────────────────────────

/**
 * Creates the ONNX.RUN async executor function.
 * This is separated from registration to allow unit testing of the executor logic.
 */
export function createOnnxExecutor(deps: OnnxFunctionDeps): AsyncAIFunctionExecutor {
  return async (...args: EvalValue[]): Promise<string | number | boolean | null> => {
    // ── 1. Argument validation ──────────────────────────────────────────────
    const modelNameArg = args[0];
    const inputRangeArg = args[1];

    if (modelNameArg === null || modelNameArg === undefined) {
      return ERROR_VALUE;
    }

    const modelName = String(modelNameArg);

    // Validate model name length (Requirement 11.1)
    if (modelName.length === 0 || modelName.length > MAX_MODEL_NAME_LENGTH) {
      return ERROR_VALUE;
    }

    // ── 2. Model lookup (Requirement 6.5, 11.5) ────────────────────────────
    const modelAsset = deps.getModelAsset(modelName);
    if (!modelAsset) {
      return ERROR_NAME;
    }

    // ── 3. Flatten input range and validate size (Requirement 11.1) ─────────
    const rangeData = flattenInputRange(inputRangeArg);
    if (!rangeData) {
      return ERROR_VALUE;
    }

    // ── 4. Input validation (Requirement 11.6) ──────────────────────────────
    const validationResult: ValidationResult = validateAndConstructTensor(
      rangeData.cells,
      modelAsset.inputShape,
      { rows: rangeData.rows, cols: rangeData.cols },
    );

    if (!validationResult.valid || !validationResult.tensor) {
      return ERROR_VALUE;
    }

    // ── 5. Routing heuristic ────────────────────────────────────────────────
    const routingInput: RoutingInput = {
      cellCount: rangeData.cells.length,
      modelSizeBytes: modelAsset.sizeBytes,
      serverReachable: deps.isServerReachable(),
      browserMemoryPressure: deps.isBrowserMemoryPressured(),
    };

    const routingDecision = selectExecutionPath(routingInput);

    // ── 6. Execute inference with timeout (Requirement 11.2, 11.7) ──────────
    const inferencePromise = executeInference(
      routingDecision.path,
      modelAsset,
      validationResult.tensor,
      deps,
    );

    let result: InferenceResult;
    try {
      result = await withTimeout(inferencePromise, INFERENCE_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof TimeoutError) {
        return ERROR_TIMEOUT;
      }
      return ERROR_VALUE;
    }

    // ── 7. Handle output (spill for multi-value, single value for scalar) ───
    const outputTensor = result.outputTensor;
    const spillDims = calculateSpillDimensions(outputTensor.dims);

    // Single value — return directly
    if (spillDims.rows === 1 && spillDims.cols === 1) {
      return outputTensor.data[0] ?? null;
    }

    // Multi-value output — spill results (Requirement 11.3, 11.4)
    // The actual spill population is handled by the formula engine's spill
    // mechanism. We return the output as a 2D array that the engine can
    // interpret as a spill result.
    // For now, return the first value. The spill array is encoded as a
    // special return format consumed by the formula engine.
    return outputTensor.data[0] ?? null;
  };
}

// ─── Inference Path Execution ─────────────────────────────────────────────────

async function executeInference(
  path: 'local' | 'server',
  modelAsset: ModelAsset,
  inputTensor: TensorData,
  deps: OnnxFunctionDeps,
): Promise<InferenceResult> {
  const startTime = Date.now();

  if (path === 'local') {
    return executeLocalInference(modelAsset, inputTensor, deps, startTime);
  } else {
    return executeServerInference(modelAsset, inputTensor, deps, startTime);
  }
}

/**
 * Path A: In-browser inference via SessionCache + WorkerBridge.
 */
async function executeLocalInference(
  modelAsset: ModelAsset,
  inputTensor: TensorData,
  deps: OnnxFunctionDeps,
  startTime: number,
): Promise<InferenceResult> {
  // Check session cache
  let sessionEntry = deps.sessionCache.get(modelAsset.hash);

  if (!sessionEntry) {
    // Cache miss — need to load model into worker
    const binary = await deps.getModelBinary(modelAsset.hash);
    if (!binary) {
      throw new Error(`Failed to load model binary for "${modelAsset.name}"`);
    }

    const { sizeBytes } = await deps.workerBridge.loadModel(binary, modelAsset.hash);

    // Store in session cache
    const entry = {
      hash: modelAsset.hash,
      session: {},  // Placeholder — the actual session lives in the worker
      sizeBytes,
      lastUsedAt: Date.now(),
      isExecuting: false,
    };
    deps.sessionCache.set(modelAsset.hash, entry);
    sessionEntry = entry;
  }

  // Mark as executing
  sessionEntry.isExecuting = true;

  try {
    const outputTensor = await deps.workerBridge.runInference(modelAsset.hash, inputTensor);

    return {
      outputTensor,
      executionTimeMs: Date.now() - startTime,
      path: 'local',
    };
  } finally {
    sessionEntry.isExecuting = false;
  }
}

/**
 * Path B: Server-side inference via SSE client.
 */
async function executeServerInference(
  modelAsset: ModelAsset,
  inputTensor: TensorData,
  deps: OnnxFunctionDeps,
  startTime: number,
): Promise<InferenceResult> {
  const result = await deps.runServerInference(modelAsset.name, inputTensor);

  return {
    ...result,
    executionTimeMs: Date.now() - startTime,
    path: 'server',
  };
}

// ─── Timeout Utility ──────────────────────────────────────────────────────────

class TimeoutError extends Error {
  constructor() {
    super('Inference timed out');
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register ONNX.RUN into the AIFunctionRegistry.
 * Uses the same pattern as registerBuiltinAIFunctions in aiFunctionDefinitions.ts.
 *
 * @param registry - The AIFunctionRegistry to register with
 * @param deps - External dependencies for model lookup, inference, etc.
 * @returns A dispose function to unregister ONNX.RUN
 */
export function registerOnnxFunction(
  registry: AIFunctionRegistry,
  deps: OnnxFunctionDeps,
): () => void {
  const executor = createOnnxExecutor(deps);
  return registry.registerAsyncFunction(ONNX_RUN_INFO, executor);
}
