/**
 * SSE Client Unit Tests
 *
 * Tests for the SSE client utility that connects to POST /api/onnx/infer
 * and handles streaming inference results.
 *
 * Requirements tested: 3.1, 3.3, 3.4, 3.7, 12.1, 12.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSSELine,
  splitSSEBuffer,
  createSSEClient,
  runServerInference,
  SSEConnectionDropError,
} from './sseClient';
import type { SSEClientCallbacks, SSEClientOptions } from './sseClient';
import type { TensorData } from './types';

// ─── parseSSELine ────────────────────────────────────────────────────────────

describe('parseSSELine', () => {
  it('parses a valid metadata event', () => {
    const line = 'data: {"type":"metadata","totalChunks":5,"totalRows":2500}';
    const result = parseSSELine(line);
    expect(result).toEqual({
      type: 'metadata',
      totalChunks: 5,
      totalRows: 2500,
    });
  });

  it('parses a valid chunk event', () => {
    const line = 'data: {"type":"chunk","index":0,"data":[1.0,2.0,3.0]}';
    const result = parseSSELine(line);
    expect(result).toEqual({
      type: 'chunk',
      index: 0,
      data: [1.0, 2.0, 3.0],
    });
  });

  it('parses a done event', () => {
    const line = 'data: {"type":"done"}';
    const result = parseSSELine(line);
    expect(result).toEqual({ type: 'done' });
  });

  it('parses an error event', () => {
    const line = 'data: {"type":"error","error":"Model not found"}';
    const result = parseSSELine(line);
    expect(result).toEqual({ type: 'error', error: 'Model not found' });
  });

  it('parses a queue event with estimated wait', () => {
    const line = 'data: {"type":"queue","estimatedWaitSeconds":15}';
    const result = parseSSELine(line);
    expect(result).toEqual({ type: 'queue', estimatedWaitSeconds: 15 });
  });

  it('returns null for non-data lines', () => {
    expect(parseSSELine('event: message')).toBeNull();
    expect(parseSSELine('id: 123')).toBeNull();
    expect(parseSSELine(': comment')).toBeNull();
    expect(parseSSELine('')).toBeNull();
  });

  it('returns null for empty data line', () => {
    expect(parseSSELine('data: ')).toBeNull();
    expect(parseSSELine('data:  ')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseSSELine('data: {invalid json}')).toBeNull();
    expect(parseSSELine('data: not json at all')).toBeNull();
  });

  it('returns null if type field is missing', () => {
    expect(parseSSELine('data: {"index":0,"data":[1]}')).toBeNull();
  });
});

// ─── splitSSEBuffer ──────────────────────────────────────────────────────────

describe('splitSSEBuffer', () => {
  it('splits multiple complete events', () => {
    const buffer = 'data: {"type":"metadata","totalChunks":2,"totalRows":100}\n\ndata: {"type":"chunk","index":0,"data":[1]}\n\n';
    const { events, remainder } = splitSSEBuffer(buffer);
    expect(events).toHaveLength(2);
    expect(events[0]).toContain('metadata');
    expect(events[1]).toContain('chunk');
    expect(remainder).toBe('');
  });

  it('keeps incomplete event as remainder', () => {
    const buffer = 'data: {"type":"metadata","totalChunks":2,"totalRows":100}\n\ndata: {"type":"ch';
    const { events, remainder } = splitSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(events[0]).toContain('metadata');
    expect(remainder).toBe('data: {"type":"ch');
  });

  it('returns empty events for incomplete buffer', () => {
    const buffer = 'data: {"type":"chunk","index":0';
    const { events, remainder } = splitSSEBuffer(buffer);
    expect(events).toHaveLength(0);
    expect(remainder).toBe('data: {"type":"chunk","index":0');
  });

  it('handles empty string', () => {
    const { events, remainder } = splitSSEBuffer('');
    expect(events).toHaveLength(0);
    expect(remainder).toBe('');
  });

  it('filters out empty parts from consecutive delimiters', () => {
    const buffer = 'data: {"type":"done"}\n\n\n\n';
    const { events, remainder } = splitSSEBuffer(buffer);
    expect(events).toHaveLength(1);
    expect(remainder).toBe('');
  });
});

// ─── createSSEClient ─────────────────────────────────────────────────────────

describe('createSSEClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeCallbacks(overrides: Partial<SSEClientCallbacks> = {}): SSEClientCallbacks {
    return {
      onMetadata: vi.fn(),
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
      onQueue: vi.fn(),
      onConnectionDrop: vi.fn(),
      ...overrides,
    };
  }

  function makeStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  function mockFetchWithStream(chunks: string[], status = 200) {
    const stream = makeStreamFromChunks(chunks);
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      body: stream,
    });
  }

  const defaultOptions: SSEClientOptions = {
    modelName: 'test_model',
    inputData: [1.0, 2.0, 3.0],
    inputDims: [1, 3],
  };

  it('sends correct POST request with headers', async () => {
    mockFetchWithStream(['data: {"type":"done"}\n\n']);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/onnx/infer',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          modelName: 'test_model',
          inputData: [1.0, 2.0, 3.0],
          inputDims: [1, 3],
        }),
      }),
    );
  });

  it('includes resumeFromChunk in request body when provided', async () => {
    mockFetchWithStream(['data: {"type":"done"}\n\n']);
    const callbacks = makeCallbacks();

    createSSEClient({ ...defaultOptions, resumeFromChunk: 3 }, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.resumeFromChunk).toBe(3);
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetchWithStream(['data: {"type":"done"}\n\n']);
    const callbacks = makeCallbacks();

    createSSEClient({ ...defaultOptions, baseUrl: 'http://localhost:3000' }, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/onnx/infer',
      expect.anything(),
    );
  });

  it('calls onMetadata when metadata event is received', async () => {
    mockFetchWithStream([
      'data: {"type":"metadata","totalChunks":4,"totalRows":2000}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(callbacks.onMetadata).toHaveBeenCalledWith({
      totalChunks: 4,
      totalRows: 2000,
    });
  });

  it('calls onChunk for each chunk event', async () => {
    mockFetchWithStream([
      'data: {"type":"metadata","totalChunks":2,"totalRows":100}\n\n',
      'data: {"type":"chunk","index":0,"data":[1,2,3]}\n\n',
      'data: {"type":"chunk","index":1,"data":[4,5,6]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(callbacks.onChunk).toHaveBeenCalledTimes(2);
    expect(callbacks.onChunk).toHaveBeenCalledWith({ index: 0, data: [1, 2, 3] });
    expect(callbacks.onChunk).toHaveBeenCalledWith({ index: 1, data: [4, 5, 6] });
  });

  it('calls onQueue when queue event is received', async () => {
    mockFetchWithStream([
      'data: {"type":"queue","estimatedWaitSeconds":10}\n\n',
      'data: {"type":"metadata","totalChunks":1,"totalRows":50}\n\n',
      'data: {"type":"chunk","index":0,"data":[1]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(callbacks.onQueue).toHaveBeenCalledWith(10);
  });

  it('calls onError when error event is received', async () => {
    mockFetchWithStream([
      'data: {"type":"error","error":"Model not found"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());

    expect(callbacks.onError).toHaveBeenCalledWith('Model not found');
  });

  it('calls onError with status info for non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: null,
    });
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());

    expect(callbacks.onError).toHaveBeenCalledWith(
      'Server returned status 500: Internal Server Error',
    );
  });

  it('calls onConnectionDrop when stream ends without done event', async () => {
    // Stream that closes without sending done
    const stream = makeStreamFromChunks([
      'data: {"type":"metadata","totalChunks":5,"totalRows":2500}\n\n',
      'data: {"type":"chunk","index":0,"data":[1,2]}\n\n',
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onConnectionDrop).toHaveBeenCalled());

    expect(callbacks.onDone).not.toHaveBeenCalled();
  });

  it('does not call onConnectionDrop when cancelled', async () => {
    // Use a stream that won't finish quickly
    let pullCalled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!pullCalled) {
          pullCalled = true;
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode('data: {"type":"metadata","totalChunks":5,"totalRows":2500}\n\n'));
        }
        // Never close — simulates a long-running stream
        return new Promise(() => {});
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });
    const callbacks = makeCallbacks();

    // Simulate AbortError on cancel
    fetchMock.mockReset();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const handle = createSSEClient(defaultOptions, callbacks);

    // Cancel immediately
    handle.cancel();

    // Wait a tick to allow async handling
    await new Promise((r) => setTimeout(r, 50));

    expect(callbacks.onConnectionDrop).not.toHaveBeenCalled();
    expect(handle.isActive()).toBe(false);
  });

  it('cancel makes isActive return false', async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    const callbacks = makeCallbacks();

    const handle = createSSEClient(defaultOptions, callbacks);
    expect(handle.isActive()).toBe(true);

    handle.cancel();
    expect(handle.isActive()).toBe(false);
  });

  it('tracks last received chunk index', async () => {
    mockFetchWithStream([
      'data: {"type":"metadata","totalChunks":3,"totalRows":1500}\n\n',
      'data: {"type":"chunk","index":0,"data":[1]}\n\n',
      'data: {"type":"chunk","index":1,"data":[2]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    const handle = createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(handle.getLastReceivedChunkIndex()).toBe(1);
  });

  it('handles chunked stream data (partial events across reads)', async () => {
    // Simulate data arriving in pieces that split across event boundaries
    mockFetchWithStream([
      'data: {"type":"meta',
      'data","totalChunks":1,"totalRows":50}\n\ndata: {"type":"chunk","index":0,"data":[42]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalled());

    expect(callbacks.onMetadata).toHaveBeenCalledWith({ totalChunks: 1, totalRows: 50 });
    expect(callbacks.onChunk).toHaveBeenCalledWith({ index: 0, data: [42] });
  });

  it('handles error event with missing error message', async () => {
    mockFetchWithStream([
      'data: {"type":"error"}\n\n',
    ]);
    const callbacks = makeCallbacks();

    createSSEClient(defaultOptions, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalled());

    expect(callbacks.onError).toHaveBeenCalledWith('Unknown server error');
  });
});

// ─── runServerInference ──────────────────────────────────────────────────────

describe('runServerInference', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeStreamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  const defaultTensor: TensorData = {
    data: new Float32Array([1.0, 2.0, 3.0, 4.0]),
    dims: [2, 2],
    dtype: 'float32',
  };

  it('resolves with complete InferenceResult when all chunks received', async () => {
    const stream = makeStreamFromChunks([
      'data: {"type":"metadata","totalChunks":2,"totalRows":4}\n\n',
      'data: {"type":"chunk","index":0,"data":[10,20]}\n\n',
      'data: {"type":"chunk","index":1,"data":[30,40]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });

    const { promise } = runServerInference({
      modelName: 'test_model',
      inputTensor: defaultTensor,
    });

    const result = await promise;
    expect(result.path).toBe('server');
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(Array.from(result.outputTensor.data)).toEqual([10, 20, 30, 40]);
    expect(result.outputTensor.dims).toEqual([4]);
    expect(result.outputTensor.dtype).toBe('float32');
  });

  it('reports progress as chunks arrive', async () => {
    const stream = makeStreamFromChunks([
      'data: {"type":"metadata","totalChunks":4,"totalRows":2000}\n\n',
      'data: {"type":"chunk","index":0,"data":[1]}\n\n',
      'data: {"type":"chunk","index":1,"data":[2]}\n\n',
      'data: {"type":"chunk","index":2,"data":[3]}\n\n',
      'data: {"type":"chunk","index":3,"data":[4]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });

    const progressValues: number[] = [];
    const { promise } = runServerInference({
      modelName: 'test_model',
      inputTensor: defaultTensor,
      onProgress: (p) => progressValues.push(p),
    });

    await promise;
    expect(progressValues).toEqual([25, 50, 75, 100]);
  });

  it('calls onQueue callback when queue event received', async () => {
    const stream = makeStreamFromChunks([
      'data: {"type":"queue","estimatedWaitSeconds":12}\n\n',
      'data: {"type":"metadata","totalChunks":1,"totalRows":10}\n\n',
      'data: {"type":"chunk","index":0,"data":[99]}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });

    const onQueue = vi.fn();
    const { promise } = runServerInference({
      modelName: 'test_model',
      inputTensor: defaultTensor,
      onQueue,
    });

    await promise;
    expect(onQueue).toHaveBeenCalledWith(12);
  });

  it('rejects with error on server error event', async () => {
    const stream = makeStreamFromChunks([
      'data: {"type":"error","error":"Capacity exceeded"}\n\n',
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });

    const { promise } = runServerInference({
      modelName: 'test_model',
      inputTensor: defaultTensor,
    });

    await expect(promise).rejects.toThrow('Server inference error: Capacity exceeded');
  });

  it('rejects with SSEConnectionDropError on connection drop', async () => {
    // Stream that ends without done
    const stream = makeStreamFromChunks([
      'data: {"type":"metadata","totalChunks":5,"totalRows":2500}\n\n',
      'data: {"type":"chunk","index":0,"data":[1,2]}\n\n',
      'data: {"type":"chunk","index":1,"data":[3,4]}\n\n',
    ]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: stream,
    });

    const onConnectionDrop = vi.fn();
    const { promise } = runServerInference({
      modelName: 'test_model',
      inputTensor: defaultTensor,
      onConnectionDrop,
    });

    await expect(promise).rejects.toThrow(SSEConnectionDropError);

    try {
      await promise;
    } catch (err) {
      const dropErr = err as SSEConnectionDropError;
      expect(dropErr.partialData).toEqual([1, 2, 3, 4]);
      expect(dropErr.totalChunks).toBe(5);
    }
  });

  it('cancel handle terminates the stream', async () => {
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const { handle } = runServerInference({
      modelName: 'test_model',
      inputTensor: defaultTensor,
    });

    expect(handle.isActive()).toBe(true);
    handle.cancel();
    expect(handle.isActive()).toBe(false);
  });
});

// ─── SSEConnectionDropError ──────────────────────────────────────────────────

describe('SSEConnectionDropError', () => {
  it('stores partial data and chunk information', () => {
    const err = new SSEConnectionDropError(
      'Connection lost',
      3,
      10,
      [1, 2, 3, 4, 5],
    );

    expect(err.name).toBe('SSEConnectionDropError');
    expect(err.message).toBe('Connection lost');
    expect(err.lastChunkIndex).toBe(3);
    expect(err.totalChunks).toBe(10);
    expect(err.partialData).toEqual([1, 2, 3, 4, 5]);
  });

  it('creates a defensive copy of partial data', () => {
    const originalData = [1, 2, 3];
    const err = new SSEConnectionDropError('test', 0, 1, originalData);

    originalData.push(4);
    expect(err.partialData).toEqual([1, 2, 3]); // Not affected by mutation
  });
});
