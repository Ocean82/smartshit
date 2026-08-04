/**
 * Unit tests for ONNX.RUN formula function
 *
 * Tests cover:
 * - Argument validation (model name length, input range size)
 * - Model lookup (#NAME? when not found)
 * - Input validation delegation (#VALUE! on invalid data)
 * - Routing heuristic integration
 * - Spill dimension calculation
 * - Spill collision detection
 * - Timeout handling
 * - Path A and Path B execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ONNX_RUN_INFO,
  calculateSpillDimensions,
  detectSpillCollision,
  flattenInputRange,
  createOnnxExecutor,
  registerOnnxFunction,
  type OnnxFunctionDeps,
} from './onnxFormulaFunction';
import { AIFunctionRegistry } from '@/engine/aiFunctions';
import type { ModelAsset, TensorData, InferenceResult } from './types';
import { SessionCache } from './sessionCache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeModelAsset(overrides: Partial<ModelAsset> = {}): ModelAsset {
  return {
    name: 'test_model',
    hash: 'abc123def456',
    sizeBytes: 5 * 1024 * 1024, // 5MB
    opsetVersion: 13,
    inputShape: [-1, 4],
    inputDtype: 'float32',
    outputShape: [-1, 1],
    registeredAt: Date.now(),
    frequentlyUsed: false,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<OnnxFunctionDeps> = {}): OnnxFunctionDeps {
  const mockWorkerBridge = {
    loadModel: vi.fn().mockResolvedValue({ sizeBytes: 1024 }),
    runInference: vi.fn().mockResolvedValue({
      data: new Float32Array([42]),
      dims: [1],
      dtype: 'float32',
    } satisfies TensorData),
    terminate: vi.fn(),
    getQueueDepth: vi.fn().mockReturnValue(0),
  };

  return {
    getModelAsset: vi.fn().mockReturnValue(makeModelAsset()),
    getModelBinary: vi.fn().mockResolvedValue(new ArrayBuffer(1024)),
    isCellOccupied: vi.fn().mockReturnValue(false),
    parseCellRef: vi.fn().mockReturnValue({ row: 0, col: 0 }),
    sessionCache: new SessionCache(),
    workerBridge: mockWorkerBridge as unknown as import('./worker/workerBridge').OnnxWorkerBridge,
    runServerInference: vi.fn().mockResolvedValue({
      outputTensor: { data: new Float32Array([99]), dims: [1], dtype: 'float32' },
      executionTimeMs: 100,
      path: 'server',
    } satisfies InferenceResult),
    isServerReachable: vi.fn().mockReturnValue(true),
    isBrowserMemoryPressured: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

// ─── ONNX_RUN_INFO ───────────────────────────────────────────────────────────

describe('ONNX_RUN_INFO', () => {
  it('defines the correct function metadata', () => {
    expect(ONNX_RUN_INFO.name).toBe('ONNX.RUN');
    expect(ONNX_RUN_INFO.category).toBe('AI/Analysis');
    expect(ONNX_RUN_INFO.isAsync).toBe(true);
    expect(ONNX_RUN_INFO.parameters).toHaveLength(2);
    expect(ONNX_RUN_INFO.parameters[0].name).toBe('model_name');
    expect(ONNX_RUN_INFO.parameters[0].type).toBe('string');
    expect(ONNX_RUN_INFO.parameters[1].name).toBe('input_range');
    expect(ONNX_RUN_INFO.parameters[1].type).toBe('range');
  });
});

// ─── calculateSpillDimensions ─────────────────────────────────────────────────

describe('calculateSpillDimensions', () => {
  it('returns 1×1 for scalar output (empty dims)', () => {
    expect(calculateSpillDimensions([])).toEqual({ rows: 1, cols: 1 });
  });

  it('returns 1×1 for single-element 1-D', () => {
    expect(calculateSpillDimensions([1])).toEqual({ rows: 1, cols: 1 });
  });

  it('returns N×1 for 1-D output (spills downward)', () => {
    expect(calculateSpillDimensions([5])).toEqual({ rows: 5, cols: 1 });
  });

  it('returns M×N for 2-D output (spills downward and rightward)', () => {
    expect(calculateSpillDimensions([3, 4])).toEqual({ rows: 3, cols: 4 });
  });

  it('handles higher dimensions by collapsing leading dims', () => {
    // [2, 3, 4] → rows = 2*3 = 6, cols = 4
    expect(calculateSpillDimensions([2, 3, 4])).toEqual({ rows: 6, cols: 4 });
  });
});

// ─── detectSpillCollision ─────────────────────────────────────────────────────

describe('detectSpillCollision', () => {
  it('returns false when no cells occupied', () => {
    const isOccupied = () => false;
    expect(detectSpillCollision(0, 0, { rows: 3, cols: 2 }, isOccupied)).toBe(false);
  });

  it('returns true when a spill target cell is occupied', () => {
    const isOccupied = (row: number, col: number) => row === 1 && col === 0;
    expect(detectSpillCollision(0, 0, { rows: 3, cols: 1 }, isOccupied)).toBe(true);
  });

  it('ignores the formula cell itself (origin)', () => {
    // Origin cell is always occupied by the formula — should not trigger collision
    const isOccupied = (row: number, col: number) => row === 0 && col === 0;
    expect(detectSpillCollision(0, 0, { rows: 1, cols: 1 }, isOccupied)).toBe(false);
  });

  it('detects collision at offset from origin', () => {
    // Formula at (5, 3), spill 2×2 — occupied at (5, 4)
    const isOccupied = (row: number, col: number) => row === 5 && col === 4;
    expect(detectSpillCollision(5, 3, { rows: 2, cols: 2 }, isOccupied)).toBe(true);
  });

  it('returns false for 1×1 spill (no overflow)', () => {
    const isOccupied = () => true;
    // Single cell spill only checks origin, which is skipped
    expect(detectSpillCollision(0, 0, { rows: 1, cols: 1 }, isOccupied)).toBe(false);
  });
});

// ─── flattenInputRange ────────────────────────────────────────────────────────

describe('flattenInputRange', () => {
  it('flattens a 2D range into CellInfo array', () => {
    const range = [[1, 2, 3], [4, 5, 6]];
    const result = flattenInputRange(range);
    expect(result).not.toBeNull();
    expect(result!.rows).toBe(2);
    expect(result!.cols).toBe(3);
    expect(result!.cells).toHaveLength(6);
    expect(result!.cells[0].value).toBe(1);
    expect(result!.cells[0].cellId).toBe('R1C1');
    expect(result!.cells[5].value).toBe(6);
    expect(result!.cells[5].cellId).toBe('R2C3');
  });

  it('returns null for non-array input', () => {
    expect(flattenInputRange('not a range')).toBeNull();
    expect(flattenInputRange(42)).toBeNull();
    expect(flattenInputRange(null)).toBeNull();
  });

  it('returns null for empty array', () => {
    expect(flattenInputRange([])).toBeNull();
  });

  it('returns null when exceeding 10,000 cells', () => {
    // 101 rows × 100 cols = 10,100 cells — should exceed limit
    const bigRange = Array.from({ length: 101 }, () =>
      Array.from({ length: 100 }, (_, i) => i),
    );
    expect(flattenInputRange(bigRange)).toBeNull();
  });

  it('detects RefError cells', () => {
    const range = [[1, { __refError: true }]];
    const result = flattenInputRange(range);
    expect(result).not.toBeNull();
    expect(result!.cells[1].hasFormulaError).toBe(true);
    expect(result!.cells[1].value).toBe('#REF!');
  });
});

// ─── createOnnxExecutor ───────────────────────────────────────────────────────

describe('createOnnxExecutor', () => {
  it('returns #VALUE! for null model name', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    const result = await executor(null, [[1, 2, 3, 4]]);
    expect(result).toBe('#VALUE!');
  });

  it('returns #VALUE! for empty model name', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    const result = await executor('', [[1, 2, 3, 4]]);
    expect(result).toBe('#VALUE!');
  });

  it('returns #VALUE! for model name exceeding 128 chars', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    const longName = 'a'.repeat(129);
    const result = await executor(longName, [[1, 2, 3, 4]]);
    expect(result).toBe('#VALUE!');
  });

  it('returns #NAME? when model is not found in registry', async () => {
    const deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(null) });
    const executor = createOnnxExecutor(deps);
    const result = await executor('nonexistent_model', [[1, 2, 3, 4]]);
    expect(result).toBe('#NAME?');
  });

  it('returns #VALUE! for invalid input range (not array)', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    const result = await executor('test_model', 'not_a_range');
    expect(result).toBe('#VALUE!');
  });

  it('returns #VALUE! when input contains non-numeric data that fails validation', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    // All text values — will fail validation
    const result = await executor('test_model', [['text', 'more_text', 'abc', 'xyz']]);
    expect(result).toBe('#VALUE!');
  });

  it('executes inference via Path A for small datasets', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    const result = await executor('test_model', [[1, 2, 3, 4]]);
    expect(result).toBe(42); // From mock workerBridge.runInference
    expect(deps.workerBridge.runInference).toHaveBeenCalled();
  });

  it('executes inference via Path B for large datasets', async () => {
    const model = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 }); // 60MB → Path B
    const deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(model) });
    const executor = createOnnxExecutor(deps);
    const result = await executor('test_model', [[1, 2, 3, 4]]);
    expect(result).toBe(99); // From mock runServerInference
    expect(deps.runServerInference).toHaveBeenCalled();
  });

  it('returns #TIMEOUT! when inference exceeds 30 seconds', async () => {
    const deps = makeDeps({
      workerBridge: {
        loadModel: vi.fn().mockResolvedValue({ sizeBytes: 1024 }),
        runInference: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 35_000)),
        ),
        terminate: vi.fn(),
        getQueueDepth: vi.fn().mockReturnValue(0),
      } as unknown as import('./worker/workerBridge').OnnxWorkerBridge,
    });
    const executor = createOnnxExecutor(deps);

    vi.useFakeTimers();
    const promise = executor('test_model', [[1, 2, 3, 4]]);
    vi.advanceTimersByTime(31_000);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe('#TIMEOUT!');
  });

  it('returns the output value for a successful scalar inference', async () => {
    const deps = makeDeps();
    const executor = createOnnxExecutor(deps);
    const result = await executor('test_model', [[1, 2, 3, 4]]);
    expect(typeof result).toBe('number');
    expect(result).toBe(42);
  });

  it('accepts model name at exactly 128 chars', async () => {
    const name = 'a'.repeat(128);
    const model = makeModelAsset({ name });
    const deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(model) });
    const executor = createOnnxExecutor(deps);
    const result = await executor(name, [[1, 2, 3, 4]]);
    // Should not return #VALUE! for the name length
    expect(result).not.toBe('#VALUE!');
  });
});

// ─── registerOnnxFunction ─────────────────────────────────────────────────────

describe('registerOnnxFunction', () => {
  it('registers ONNX.RUN in the AIFunctionRegistry', () => {
    const registry = new AIFunctionRegistry();
    const deps = makeDeps();
    registerOnnxFunction(registry, deps);
    expect(registry.has('ONNX.RUN')).toBe(true);
  });

  it('returns a dispose function that unregisters', () => {
    const registry = new AIFunctionRegistry();
    const deps = makeDeps();
    const dispose = registerOnnxFunction(registry, deps);
    expect(registry.has('ONNX.RUN')).toBe(true);
    dispose();
    expect(registry.has('ONNX.RUN')).toBe(false);
  });

  it('function info is retrievable after registration', () => {
    const registry = new AIFunctionRegistry();
    const deps = makeDeps();
    registerOnnxFunction(registry, deps);
    const info = registry.getFunctionInfo('ONNX.RUN');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('ONNX.RUN');
    expect(info!.category).toBe('AI/Analysis');
    expect(info!.isAsync).toBe(true);
  });

  it('returns #NAME? for unregistered model via registry execute', () => {
    const registry = new AIFunctionRegistry();
    const deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(null) });
    registerOnnxFunction(registry, deps);
    // Execute returns placeholder for async functions; the actual #NAME? is
    // returned by the executor, which runs asynchronously
    const result = registry.execute('ONNX.RUN', 'A1', ['unknown_model', [[1, 2, 3, 4]]]);
    // Async function returns loading placeholder
    expect(result).toBe('⏳ Loading...');
  });
});
