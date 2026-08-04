/**
 * Unit Tests for ONNX SSE Inference Endpoint
 *
 * Tests validation, chunking logic, operator scanning,
 * and SSE streaming behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateInferRequest,
  calculateTotalRows,
  calculateChunks,
  extractChunk,
  scanForNonStandardOperators,
  createOnnxRouter,
} from './onnx-infer.js';

// ─── Pure function tests ─────────────────────────────────────────────────────

describe('calculateTotalRows', () => {
  it('returns first dimension as total rows', () => {
    expect(calculateTotalRows([100, 4])).toBe(100);
  });

  it('handles single dimension', () => {
    expect(calculateTotalRows([50])).toBe(50);
  });

  it('handles 3D input', () => {
    expect(calculateTotalRows([200, 10, 3])).toBe(200);
  });

  it('returns 0 for empty dims', () => {
    expect(calculateTotalRows([])).toBe(0);
  });
});

describe('calculateChunks', () => {
  it('returns single chunk for ≤ 100 rows', () => {
    expect(calculateChunks(50)).toEqual({ totalChunks: 1, chunkSize: 50 });
    expect(calculateChunks(100)).toEqual({ totalChunks: 1, chunkSize: 100 });
    expect(calculateChunks(1)).toEqual({ totalChunks: 1, chunkSize: 1 });
  });

  it('chunks into groups of 500 for > 100 rows', () => {
    expect(calculateChunks(101)).toEqual({ totalChunks: 1, chunkSize: 500 });
    expect(calculateChunks(500)).toEqual({ totalChunks: 1, chunkSize: 500 });
    expect(calculateChunks(501)).toEqual({ totalChunks: 2, chunkSize: 500 });
    expect(calculateChunks(1000)).toEqual({ totalChunks: 2, chunkSize: 500 });
    expect(calculateChunks(1001)).toEqual({ totalChunks: 3, chunkSize: 500 });
  });

  it('handles exact multiples of 500', () => {
    expect(calculateChunks(1500)).toEqual({ totalChunks: 3, chunkSize: 500 });
    expect(calculateChunks(5000)).toEqual({ totalChunks: 10, chunkSize: 500 });
  });

  it('handles large batch sizes', () => {
    expect(calculateChunks(10000)).toEqual({ totalChunks: 20, chunkSize: 500 });
    expect(calculateChunks(999999)).toEqual({ totalChunks: 2000, chunkSize: 500 });
  });
});

describe('extractChunk', () => {
  it('extracts correct chunk from results with single column', () => {
    const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // chunkSize=5, totalRows=10, columnsPerRow=1
    expect(extractChunk(results, 0, 5, 10, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(extractChunk(results, 1, 5, 10, 1)).toEqual([6, 7, 8, 9, 10]);
  });

  it('extracts correct chunk with multiple columns', () => {
    // 4 rows × 3 columns = 12 elements
    const results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    // chunkSize=2, totalRows=4, columnsPerRow=3
    expect(extractChunk(results, 0, 2, 4, 3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(extractChunk(results, 1, 2, 4, 3)).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('handles last chunk with fewer rows', () => {
    const results = [1, 2, 3, 4, 5, 6, 7];
    // chunkSize=5, totalRows=7, columnsPerRow=1
    expect(extractChunk(results, 0, 5, 7, 1)).toEqual([1, 2, 3, 4, 5]);
    expect(extractChunk(results, 1, 5, 7, 1)).toEqual([6, 7]);
  });

  it('handles single row', () => {
    const results = [1.5, 2.5, 3.5];
    expect(extractChunk(results, 0, 1, 1, 3)).toEqual([1.5, 2.5, 3.5]);
  });
});

describe('scanForNonStandardOperators', () => {
  it('returns empty array for standard operators', () => {
    const ops = ['Conv', 'Relu', 'MatMul', 'Add', 'Softmax'];
    expect(scanForNonStandardOperators(ops)).toEqual([]);
  });

  it('detects non-standard operators', () => {
    const ops = ['Conv', 'CustomOp', 'Relu', 'MySpecialOp'];
    expect(scanForNonStandardOperators(ops)).toEqual(['CustomOp', 'MySpecialOp']);
  });

  it('returns empty array for empty input', () => {
    expect(scanForNonStandardOperators([])).toEqual([]);
  });

  it('all common operators pass validation', () => {
    const common = [
      'Conv', 'Relu', 'BatchNormalization', 'MaxPool', 'AveragePool',
      'Flatten', 'Gemm', 'Softmax', 'Dropout', 'Reshape',
      'Add', 'Mul', 'Sub', 'Div', 'MatMul', 'Concat', 'Transpose',
      'Sigmoid', 'Tanh', 'LSTM', 'GRU', 'RNN',
    ];
    expect(scanForNonStandardOperators(common)).toEqual([]);
  });
});

// ─── Validation tests ────────────────────────────────────────────────────────

describe('validateInferRequest', () => {
  const validRequest = {
    modelName: 'linear_reg',
    inputData: [1.0, 2.0, 3.0, 4.0],
    inputDims: [2, 2],
  };

  it('returns null for valid request', () => {
    expect(validateInferRequest(validRequest)).toBeNull();
  });

  it('rejects null body', () => {
    expect(validateInferRequest(null)).toBe('Request body is required');
  });

  it('rejects non-object body', () => {
    expect(validateInferRequest('string')).toBe('Request body is required');
  });

  it('rejects missing modelName', () => {
    expect(validateInferRequest({ inputData: [1], inputDims: [1] }))
      .toBe('modelName is required and must be a string');
  });

  it('rejects non-string modelName', () => {
    expect(validateInferRequest({ modelName: 123, inputData: [1], inputDims: [1] }))
      .toBe('modelName is required and must be a string');
  });

  it('rejects missing inputData', () => {
    expect(validateInferRequest({ modelName: 'test', inputDims: [1] }))
      .toBe('inputData is required and must be an array of numbers');
  });

  it('rejects non-array inputData', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: 'data', inputDims: [1] }))
      .toBe('inputData is required and must be an array of numbers');
  });

  it('rejects missing inputDims', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: [1] }))
      .toBe('inputDims is required and must be a non-empty array of numbers');
  });

  it('rejects empty inputDims', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: [1], inputDims: [] }))
      .toBe('inputDims is required and must be a non-empty array of numbers');
  });

  it('rejects NaN in inputData', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: [1, NaN], inputDims: [2] }))
      .toBe('inputData[1] must be a valid number');
  });

  it('rejects non-numeric in inputData', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: [1, 'a'], inputDims: [2] }))
      .toBe('inputData[1] must be a valid number');
  });

  it('rejects non-positive inputDims', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: [1], inputDims: [0] }))
      .toBe('inputDims[0] must be a positive integer');
  });

  it('rejects non-integer inputDims', () => {
    expect(validateInferRequest({ modelName: 'test', inputData: [1], inputDims: [1.5] }))
      .toBe('inputDims[0] must be a positive integer');
  });

  it('rejects input exceeding 1,000,000 rows', () => {
    const result = validateInferRequest({
      modelName: 'test',
      inputData: [1],
      inputDims: [1_000_001, 4],
    });
    expect(result).toContain('Input exceeds maximum batch size');
    expect(result).toContain('1000001');
  });

  it('accepts exactly 1,000,000 rows', () => {
    expect(validateInferRequest({
      modelName: 'test',
      inputData: [1],
      inputDims: [1_000_000, 1],
    })).toBeNull();
  });

  it('accepts valid resumeFromChunk', () => {
    expect(validateInferRequest({
      ...validRequest,
      resumeFromChunk: 0,
    })).toBeNull();
  });

  it('rejects negative resumeFromChunk', () => {
    expect(validateInferRequest({
      ...validRequest,
      resumeFromChunk: -1,
    })).toBe('resumeFromChunk must be a non-negative integer');
  });

  it('rejects non-integer resumeFromChunk', () => {
    expect(validateInferRequest({
      ...validRequest,
      resumeFromChunk: 1.5,
    })).toBe('resumeFromChunk must be a non-negative integer');
  });
});

// ─── Router integration tests (mocked session pool) ──────────────────────────

describe('createOnnxRouter (integration)', () => {
  let mockRes: {
    setHeader: ReturnType<typeof vi.fn>;
    flushHeaders: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    writableEnded: boolean;
  };
  let mockReq: {
    body: unknown;
    on: ReturnType<typeof vi.fn>;
  };
  let closeHandler: (() => void) | null;

  beforeEach(() => {
    closeHandler = null;
    mockRes = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(() => { mockRes.writableEnded = true; }),
      writableEnded: false,
    };
    mockReq = {
      body: {},
      on: vi.fn((event: string, handler: () => void) => {
        if (event === 'close') {
          closeHandler = handler;
        }
      }),
    };
  });

  function getSSEEvents(): SSEChunk[] {
    return mockRes.write.mock.calls
      .map(call => {
        const str = call[0] as string;
        const match = str.match(/^data: (.+)\n\n$/);
        if (match) return JSON.parse(match[1]) as SSEChunk;
        return null;
      })
      .filter((e): e is SSEChunk => e !== null);
  }

  it('sets SSE headers on response', async () => {
    const mockPool = {
      acquire: vi.fn().mockResolvedValue({}),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    // Access the route handler directly
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1], inputDims: [1] };
    await handler(mockReq, mockRes);

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
  });

  it('emits error event for invalid request', async () => {
    const router = createOnnxRouter();
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 123 }; // Invalid
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].error).toContain('modelName');
  });

  it('emits error when session pool not configured', async () => {
    const router = createOnnxRouter(undefined);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1, 2], inputDims: [2] };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    expect(events[0].type).toBe('error');
    expect(events[0].error).toBe('Session pool not configured');
  });

  it('emits queue event when pool is at capacity', async () => {
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [{ opType: 'MatMul' }] } },
      run: vi.fn().mockResolvedValue({
        output: { data: Float32Array.from([1, 2]), dims: [2] },
      }),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 10, active: 10, queued: 3 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1, 2], inputDims: [2] };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    const queueEvent = events.find(e => e.type === 'queue');
    expect(queueEvent).toBeDefined();
    expect(queueEvent!.estimatedWaitSeconds).toBe(15); // 3 queued * 5s
  });

  it('emits metadata, chunk, and done events for small batch', async () => {
    const outputData = Float32Array.from([10, 20, 30, 40, 50]);
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [{ opType: 'Relu' }] } },
      run: vi.fn().mockResolvedValue({
        output: { data: outputData, dims: [5] },
      }),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'linear_reg', inputData: [1, 2, 3, 4, 5], inputDims: [5] };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    // metadata, chunk (single since ≤ 100), done
    const metaEvent = events.find(e => e.type === 'metadata');
    expect(metaEvent).toBeDefined();
    expect(metaEvent!.totalChunks).toBe(1);
    expect(metaEvent!.totalRows).toBe(5);

    const chunkEvent = events.find(e => e.type === 'chunk');
    expect(chunkEvent).toBeDefined();
    expect(chunkEvent!.index).toBe(0);
    expect(chunkEvent!.data).toEqual([10, 20, 30, 40, 50]);

    const doneEvent = events.find(e => e.type === 'done');
    expect(doneEvent).toBeDefined();
  });

  it('releases session back to pool on completion', async () => {
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [] } },
      run: vi.fn().mockResolvedValue({
        output: { data: Float32Array.from([1]), dims: [1] },
      }),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1], inputDims: [1] };
    await handler(mockReq, mockRes);

    expect(mockPool.release).toHaveBeenCalledWith('test');
  });

  it('releases session on client disconnect', async () => {
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [] } },
      run: vi.fn().mockImplementation(() => {
        // Simulate disconnect during inference
        if (closeHandler) closeHandler();
        return Promise.resolve({
          output: { data: Float32Array.from([1]), dims: [1] },
        });
      }),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1], inputDims: [1] };
    await handler(mockReq, mockRes);

    expect(mockPool.release).toHaveBeenCalledWith('test');
  });

  it('emits error for non-standard operators', async () => {
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [{ opType: 'CustomOp' }, { opType: 'Relu' }] } },
      run: vi.fn(),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1], inputDims: [1] };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toContain('non-standard operators');
    expect(errorEvent!.error).toContain('CustomOp');
    // Session should still be released
    expect(mockPool.release).toHaveBeenCalledWith('test');
  });

  it('supports resumeFromChunk parameter', async () => {
    // 200 rows → totalChunks = 1 (ceil(200/500) = 1 since >100, using CHUNK_SIZE)
    // Actually, 200 > 100, so ceil(200/500) = 1 chunk of 500 (but only 200 rows)
    // Let's use a larger dataset: 1500 rows → 3 chunks of 500
    const outputData = Float32Array.from(new Array(1500).fill(0).map((_, i) => i));
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [{ opType: 'Add' }] } },
      run: vi.fn().mockResolvedValue({
        output: { data: outputData, dims: [1500] },
      }),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    // Resume from chunk 1 (skip first chunk)
    mockReq.body = {
      modelName: 'test',
      inputData: new Array(1500).fill(1),
      inputDims: [1500],
      resumeFromChunk: 1,
    };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    const chunkEvents = events.filter(e => e.type === 'chunk');
    // Should only have chunks 1 and 2 (skipping chunk 0)
    expect(chunkEvents.length).toBe(2);
    expect(chunkEvents[0].index).toBe(1);
    expect(chunkEvents[1].index).toBe(2);
  });

  it('rejects resumeFromChunk exceeding total chunks', async () => {
    const router = createOnnxRouter();
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = {
      modelName: 'test',
      inputData: [1, 2],
      inputDims: [2], // 2 rows → 1 chunk
      resumeFromChunk: 5, // exceeds total chunks
    };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    expect(events[0].type).toBe('error');
    expect(events[0].error).toContain('resumeFromChunk');
  });

  it('emits error on inference failure', async () => {
    const mockSession = {
      inputNames: ['input'],
      handler: { graph: { nodes: [] } },
      run: vi.fn().mockRejectedValue(new Error('Out of memory')),
    };
    const mockPool = {
      acquire: vi.fn().mockResolvedValue(mockSession),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 1, active: 0, queued: 0 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1], inputDims: [1] };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toBe('Out of memory');
    // Session still released
    expect(mockPool.release).toHaveBeenCalledWith('test');
  });

  it('emits error when pool acquire fails', async () => {
    const mockPool = {
      acquire: vi.fn().mockRejectedValue(new Error('Server at capacity: 50 requests queued')),
      release: vi.fn(),
      getStatus: vi.fn().mockReturnValue({ loaded: 10, active: 10, queued: 50 }),
    } as unknown as import('../onnx/sessionPool.js').SessionPool;

    const router = createOnnxRouter(mockPool);
    const handler = (router as unknown as { stack: Array<{ route: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Function }> } }> }).stack[0].route.stack[0].handle;

    mockReq.body = { modelName: 'test', inputData: [1, 2], inputDims: [2] };
    await handler(mockReq, mockRes);

    const events = getSSEEvents();
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toContain('capacity');
  });
});

// ─── SSEChunk type import for use in tests ───────────────────────────────────
import type { SSEChunk } from './onnx-infer.js';
