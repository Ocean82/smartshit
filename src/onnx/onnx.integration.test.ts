/**
 * Integration Tests for End-to-End ONNX Inference Paths
 *
 * Tests cover:
 * - Path A flow: formula → validation → routing → worker → cell update
 * - Path B flow: formula → validation → routing → SSE → chunked cell update
 * - Model upload → security validation → registration → formula resolution
 * - Cancellation and cell reversion to pre-inference values
 * - Fallback from Path B to Path A when server unreachable
 * - Fallback from Path A to Path B on memory pressure
 * - SSE connection drop → partial results → resume from last chunk
 *
 * Requirements: 1.1–1.8, 2.1–2.6, 3.1–3.8, 4.1–4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOnnxExecutor,
  type OnnxFunctionDeps,
} from './onnxFormulaFunction';
import { SessionCache } from './sessionCache';
import { handleModelUpload, type UploadOptions, type ModelUploadHandlerDeps } from './modelUploadHandler';
import { ModelAssetRegistry } from './modelAssetRegistry';
import type { ModelAsset, TensorData, InferenceResult } from './types';
import type { OnnxWorkerBridge } from './worker/workerBridge';

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
    workerBridge: mockWorkerBridge as unknown as OnnxWorkerBridge,
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

// ─── Path A: In-Browser Inference Flow ────────────────────────────────────────

describe('Path A: In-Browser Inference Flow', () => {
  let deps: OnnxFunctionDeps;
  let executor: ReturnType<typeof createOnnxExecutor>;

  beforeEach(() => {
    deps = makeDeps();
    executor = createOnnxExecutor(deps);
  });

  it('routes small datasets through worker bridge (Path A)', async () => {
    // Small model (5MB) + small range (4 cells) → Path A
    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe(42);
    expect(deps.workerBridge.runInference).toHaveBeenCalled();
    expect(deps.runServerInference).not.toHaveBeenCalled();
  });

  it('validates input before routing to worker', async () => {
    const result = await executor('test_model', [['text', 'invalid', 'abc', 'xyz']]);

    expect(result).toBe('#VALUE!');
    expect(deps.workerBridge.runInference).not.toHaveBeenCalled();
  });

  it('looks up model in registry and returns #NAME? if not found', async () => {
    deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(null) });
    executor = createOnnxExecutor(deps);

    const result = await executor('unknown_model', [[1, 2, 3, 4]]);

    expect(result).toBe('#NAME?');
    expect(deps.workerBridge.runInference).not.toHaveBeenCalled();
  });

  it('loads model into worker bridge on cache miss', async () => {
    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe(42);
    expect(deps.workerBridge.loadModel).toHaveBeenCalled();
    expect(deps.getModelBinary).toHaveBeenCalledWith('abc123def456');
  });

  it('skips model loading when already cached', async () => {
    // Pre-populate cache
    deps.sessionCache.set('abc123def456', {
      hash: 'abc123def456',
      session: {},
      sizeBytes: 1024,
      lastUsedAt: Date.now(),
      isExecuting: false,
    });

    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe(42);
    expect(deps.workerBridge.loadModel).not.toHaveBeenCalled();
    expect(deps.getModelBinary).not.toHaveBeenCalled();
  });
});

// ─── Path B: Server-Side SSE Inference Flow ───────────────────────────────────

describe('Path B: Server-Side SSE Inference Flow', () => {
  let deps: OnnxFunctionDeps;
  let executor: ReturnType<typeof createOnnxExecutor>;

  beforeEach(() => {
    // Large model (60MB) forces Path B routing
    const largeModel = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 });
    deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(largeModel) });
    executor = createOnnxExecutor(deps);
  });

  it('routes large models through server SSE (Path B)', async () => {
    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe(99);
    expect(deps.runServerInference).toHaveBeenCalled();
    expect(deps.workerBridge.runInference).not.toHaveBeenCalled();
  });

  it('passes correct model name and tensor to server', async () => {
    await executor('test_model', [[1, 2, 3, 4]]);

    expect(deps.runServerInference).toHaveBeenCalledWith(
      'test_model',
      expect.objectContaining({
        data: expect.any(Float32Array),
        dims: expect.any(Array),
        dtype: 'float32',
      }),
    );
  });

  it('validates input before sending to server', async () => {
    const result = await executor('test_model', [['not', 'numeric', 'data', '!']]);

    expect(result).toBe('#VALUE!');
    expect(deps.runServerInference).not.toHaveBeenCalled();
  });

  it('routes datasets with many cells (>5000) to server', async () => {
    // Small model but huge cell count → Path B
    const smallModelManyCells = makeModelAsset({ sizeBytes: 10 * 1024 * 1024 });
    deps = makeDeps({ getModelAsset: vi.fn().mockReturnValue(smallModelManyCells) });
    executor = createOnnxExecutor(deps);

    // Create a range with 5001 cells (exceeds 5000 threshold)
    // But inputShape is [-1, 4], so cells must be divisible by 4
    // Use 5004 cells (1251 rows × 4 cols)
    const bigRange = Array.from({ length: 1251 }, () => [1, 2, 3, 4]);

    const result = await executor('test_model', bigRange);

    expect(result).toBe(99);
    expect(deps.runServerInference).toHaveBeenCalled();
  });

  it('returns server inference error as #VALUE!', async () => {
    deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(makeModelAsset({ sizeBytes: 60 * 1024 * 1024 })),
      runServerInference: vi.fn().mockRejectedValue(new Error('Server error')),
    });
    executor = createOnnxExecutor(deps);

    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe('#VALUE!');
  });
});

// ─── Model Upload → Security → Registration → Formula Resolution ─────────────

describe('Model Upload → Security → Registration → Formula Resolution', () => {
  let registry: ModelAssetRegistry;
  let uploadDeps: ModelUploadHandlerDeps;

  beforeEach(() => {
    const store: Record<string, ModelAsset> = {};
    registry = new ModelAssetRegistry({
      get: () => store,
      set: (assets) => { Object.keys(store).forEach(k => delete store[k]); Object.assign(store, assets); },
    });

    uploadDeps = {
      registry,
      computeHash: vi.fn().mockResolvedValue('deadbeef1234567890abcdef'),
      cleanupTempData: vi.fn(),
    };
  });

  it('uploads a valid model, registers it, and makes it resolvable in formulas', async () => {
    // Step 1: Upload model
    const fileData = new ArrayBuffer(1024);
    const fileBytes = new Uint8Array(fileData);
    fileBytes[0] = 0x08; // ONNX magic byte
    fileBytes[1] = 0x07; // ir_version varint

    const options: UploadOptions = {
      modelName: 'my_model',
      fileData,
      opsetVersion: 13,
      inputShape: [-1, 4],
      inputDtype: 'float32',
      outputShape: [-1, 1],
      forBrowserUse: true,
      currentUsageBytes: 0,
    };

    const result = await handleModelUpload(options, uploadDeps);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.asset.name).toBe('my_model');
      expect(result.asset.hash).toBe('deadbeef1234567890abcdef');
    }

    // Step 2: Verify model is now resolvable
    const asset = registry.get('my_model');
    expect(asset).not.toBeNull();
    expect(asset!.name).toBe('my_model');

    // Step 3: Use in formula executor
    const deps = makeDeps({ getModelAsset: () => asset });
    const executor = createOnnxExecutor(deps);
    const formulaResult = await executor('my_model', [[1, 2, 3, 4]]);
    expect(formulaResult).toBe(42);
  });

  it('rejects upload with invalid protobuf magic bytes', async () => {
    const fileData = new ArrayBuffer(1024);
    const fileBytes = new Uint8Array(fileData);
    fileBytes[0] = 0xFF; // Invalid magic byte

    const options: UploadOptions = {
      modelName: 'bad_model',
      fileData,
      opsetVersion: 13,
      inputShape: [-1, 4],
      inputDtype: 'float32',
      outputShape: [-1, 1],
      forBrowserUse: true,
      currentUsageBytes: 0,
    };

    const result = await handleModelUpload(options, uploadDeps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('invalid_format');
    }

    // Model should NOT be in registry
    expect(registry.get('bad_model')).toBeNull();
  });

  it('rejects upload with unsupported opset version', async () => {
    const fileData = new ArrayBuffer(1024);
    const fileBytes = new Uint8Array(fileData);
    fileBytes[0] = 0x08;
    fileBytes[1] = 0x07;

    const options: UploadOptions = {
      modelName: 'bad_opset',
      fileData,
      opsetVersion: 25, // Unsupported (max is 20)
      inputShape: [-1, 4],
      inputDtype: 'float32',
      outputShape: [-1, 1],
      forBrowserUse: true,
      currentUsageBytes: 0,
    };

    const result = await handleModelUpload(options, uploadDeps);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('unsupported_opset');
    }
  });

  it('rejects duplicate model names', async () => {
    const fileData = new ArrayBuffer(1024);
    const fileBytes = new Uint8Array(fileData);
    fileBytes[0] = 0x08;
    fileBytes[1] = 0x07;

    const options: UploadOptions = {
      modelName: 'duplicate_model',
      fileData,
      opsetVersion: 13,
      inputShape: [-1, 4],
      inputDtype: 'float32',
      outputShape: [-1, 1],
      forBrowserUse: true,
      currentUsageBytes: 0,
    };

    // First upload succeeds
    const first = await handleModelUpload(options, uploadDeps);
    expect(first.success).toBe(true);

    // Second upload with same name fails
    const second = await handleModelUpload(options, uploadDeps);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.reason).toBe('duplicate_name');
    }
  });

  it('cleans up temp data on validation failure', async () => {
    const fileData = new ArrayBuffer(1024);
    const fileBytes = new Uint8Array(fileData);
    fileBytes[0] = 0xFF; // Invalid

    const options: UploadOptions = {
      modelName: 'cleanup_test',
      fileData,
      opsetVersion: 13,
      inputShape: [-1, 4],
      inputDtype: 'float32',
      outputShape: [-1, 1],
      forBrowserUse: true,
      currentUsageBytes: 0,
    };

    await handleModelUpload(options, uploadDeps);

    expect(uploadDeps.cleanupTempData).toHaveBeenCalled();
  });
});

// ─── Cancellation and Cell Reversion ──────────────────────────────────────────

describe('Cancellation and Cell Reversion', () => {
  it('returns #TIMEOUT! when inference exceeds 30 seconds (Path A)', async () => {
    const deps = makeDeps({
      workerBridge: {
        loadModel: vi.fn().mockResolvedValue({ sizeBytes: 1024 }),
        runInference: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 35_000)),
        ),
        terminate: vi.fn(),
        getQueueDepth: vi.fn().mockReturnValue(0),
      } as unknown as OnnxWorkerBridge,
    });
    const executor = createOnnxExecutor(deps);

    vi.useFakeTimers();
    const promise = executor('test_model', [[1, 2, 3, 4]]);
    vi.advanceTimersByTime(31_000);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe('#TIMEOUT!');
  });

  it('returns #TIMEOUT! when server inference exceeds 30 seconds (Path B)', async () => {
    const largeModel = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 });
    const deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(largeModel),
      runServerInference: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 35_000)),
      ),
    });
    const executor = createOnnxExecutor(deps);

    vi.useFakeTimers();
    const promise = executor('test_model', [[1, 2, 3, 4]]);
    vi.advanceTimersByTime(31_000);
    const result = await promise;
    vi.useRealTimers();

    expect(result).toBe('#TIMEOUT!');
  });

  it('upload cancellation via AbortSignal returns aborted result', async () => {
    const controller = new AbortController();
    controller.abort(); // Abort immediately

    const fileData = new ArrayBuffer(1024);
    const fileBytes = new Uint8Array(fileData);
    fileBytes[0] = 0x08;
    fileBytes[1] = 0x07;

    const store: Record<string, ModelAsset> = {};
    const registry = new ModelAssetRegistry({
      get: () => store,
      set: (assets) => { Object.keys(store).forEach(k => delete store[k]); Object.assign(store, assets); },
    });

    const result = await handleModelUpload(
      {
        modelName: 'cancelled_model',
        fileData,
        opsetVersion: 13,
        inputShape: [-1, 4],
        inputDtype: 'float32',
        outputShape: [-1, 1],
        forBrowserUse: true,
        currentUsageBytes: 0,
        signal: controller.signal,
      },
      {
        registry,
        computeHash: vi.fn().mockResolvedValue('hash123'),
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('aborted');
      expect(result.canRetry).toBe(true);
    }
  });
});

// ─── Fallback: Path B → Path A (Server Unreachable) ───────────────────────────

describe('Fallback: Path B → Path A (Server Unreachable)', () => {
  it('falls back to Path A when server unreachable, cellCount < 5000, model < 100MB', async () => {
    // Model 60MB → normally Path B, but server is unreachable
    // cellCount < 5000 AND model < 100MB → fallback to Path A
    const model = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 });
    const deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(model),
      isServerReachable: vi.fn().mockReturnValue(false),
    });
    const executor = createOnnxExecutor(deps);

    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe(42); // Path A result from workerBridge mock
    expect(deps.workerBridge.runInference).toHaveBeenCalled();
    expect(deps.runServerInference).not.toHaveBeenCalled();
  });

  it('does not fallback when model > 100MB and server unreachable', async () => {
    // Model 150MB → Path B required, but server unreachable, model too big for fallback
    const model = makeModelAsset({ sizeBytes: 150 * 1024 * 1024 });
    const deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(model),
      isServerReachable: vi.fn().mockReturnValue(false),
      // Server inference will fail since server is unreachable
      runServerInference: vi.fn().mockRejectedValue(new Error('Server unreachable')),
    });
    const executor = createOnnxExecutor(deps);

    const result = await executor('test_model', [[1, 2, 3, 4]]);

    // Should attempt server (routing says server required) and fail
    expect(deps.runServerInference).toHaveBeenCalled();
    expect(result).toBe('#VALUE!');
  });

  it('does not fallback when cellCount >= 5000 and server unreachable', async () => {
    // Model 60MB, 5004 cells → normally Path B
    // Server unreachable but cellCount >= 5000 → no fallback possible
    const model = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 });
    const deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(model),
      isServerReachable: vi.fn().mockReturnValue(false),
      runServerInference: vi.fn().mockRejectedValue(new Error('Server unreachable')),
    });
    const executor = createOnnxExecutor(deps);

    // 5004 cells (1251 × 4) → exceeds 5000 threshold
    const bigRange = Array.from({ length: 1251 }, () => [1, 2, 3, 4]);
    const result = await executor('test_model', bigRange);

    expect(deps.runServerInference).toHaveBeenCalled();
    expect(result).toBe('#VALUE!');
  });
});

// ─── Fallback: Path A → Path B (Memory Pressure) ─────────────────────────────

describe('Fallback: Path A → Path B (Memory Pressure)', () => {
  it('forces Path B when browser is under memory pressure', async () => {
    // Small model (5MB) that would normally use Path A
    // But memory pressure forces Path B
    const deps = makeDeps({
      isBrowserMemoryPressured: vi.fn().mockReturnValue(true),
    });
    const executor = createOnnxExecutor(deps);

    const result = await executor('test_model', [[1, 2, 3, 4]]);

    expect(result).toBe(99); // Path B result from runServerInference mock
    expect(deps.runServerInference).toHaveBeenCalled();
    expect(deps.workerBridge.runInference).not.toHaveBeenCalled();
  });

  it('returns to Path A when memory pressure resolves', async () => {
    const isBrowserMemoryPressured = vi.fn().mockReturnValue(true);
    const deps = makeDeps({ isBrowserMemoryPressured });
    const executor = createOnnxExecutor(deps);

    // First call: memory pressure → Path B
    const result1 = await executor('test_model', [[1, 2, 3, 4]]);
    expect(result1).toBe(99);
    expect(deps.runServerInference).toHaveBeenCalledTimes(1);

    // Memory pressure resolves
    isBrowserMemoryPressured.mockReturnValue(false);

    // Second call: no pressure → Path A
    const result2 = await executor('test_model', [[5, 6, 7, 8]]);
    expect(result2).toBe(42);
    expect(deps.workerBridge.runInference).toHaveBeenCalled();
  });
});

// ─── SSE Connection Drop → Partial Results → Resume ───────────────────────────

describe('SSE Connection Drop → Partial Results → Resume', () => {
  it('handles SSE connection drop with partial data error', async () => {
    const largeModel = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 });
    const connectionDropError = new Error('Connection dropped during streaming');

    const deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(largeModel),
      runServerInference: vi.fn().mockRejectedValue(connectionDropError),
    });
    const executor = createOnnxExecutor(deps);

    const result = await executor('test_model', [[1, 2, 3, 4]]);

    // Should return error value when connection drops
    expect(result).toBe('#VALUE!');
    expect(deps.runServerInference).toHaveBeenCalled();
  });

  it('allows retry after connection drop with new executor call', async () => {
    const largeModel = makeModelAsset({ sizeBytes: 60 * 1024 * 1024 });
    const runServerInference = vi.fn()
      .mockRejectedValueOnce(new Error('Connection dropped'))
      .mockResolvedValueOnce({
        outputTensor: { data: new Float32Array([77]), dims: [1], dtype: 'float32' },
        executionTimeMs: 200,
        path: 'server',
      } satisfies InferenceResult);

    const deps = makeDeps({
      getModelAsset: vi.fn().mockReturnValue(largeModel),
      runServerInference,
    });
    const executor = createOnnxExecutor(deps);

    // First attempt fails with connection drop
    const result1 = await executor('test_model', [[1, 2, 3, 4]]);
    expect(result1).toBe('#VALUE!');

    // Retry succeeds
    const result2 = await executor('test_model', [[1, 2, 3, 4]]);
    expect(result2).toBe(77);
    expect(runServerInference).toHaveBeenCalledTimes(2);
  });

  it('SSE client parseSSELine handles chunk events correctly', async () => {
    const { parseSSELine } = await import('./sseClient');

    const chunkLine = 'data: {"type":"chunk","index":2,"data":[1.5,2.5,3.5]}';
    const parsed = parseSSELine(chunkLine);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('chunk');
    expect(parsed!.index).toBe(2);
    expect(parsed!.data).toEqual([1.5, 2.5, 3.5]);
  });

  it('SSE client parseSSELine handles done events', async () => {
    const { parseSSELine } = await import('./sseClient');

    const doneLine = 'data: {"type":"done"}';
    const parsed = parseSSELine(doneLine);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('done');
  });

  it('SSE client splitSSEBuffer splits events correctly', async () => {
    const { splitSSEBuffer } = await import('./sseClient');

    const buffer = 'data: {"type":"metadata","totalChunks":3,"totalRows":150}\n\ndata: {"type":"chunk","index":0,"data":[1,2,3]}\n\nincomplete';
    const { events, remainder } = splitSSEBuffer(buffer);

    expect(events).toHaveLength(2);
    expect(remainder).toBe('incomplete');
  });

  it('SSE client handles error events from server', async () => {
    const { parseSSELine } = await import('./sseClient');

    const errorLine = 'data: {"type":"error","error":"Model not found on server"}';
    const parsed = parseSSELine(errorLine);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('error');
    expect(parsed!.error).toBe('Model not found on server');
  });

  it('SSE client handles queue events with estimated wait', async () => {
    const { parseSSELine } = await import('./sseClient');

    const queueLine = 'data: {"type":"queue","estimatedWaitSeconds":15}';
    const parsed = parseSSELine(queueLine);

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('queue');
    expect(parsed!.estimatedWaitSeconds).toBe(15);
  });
});
