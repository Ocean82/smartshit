/**
 * Unit Tests for OnnxWorkerBridge
 *
 * Tests the main thread ↔ worker messaging bridge including:
 * - loadModel request/response
 * - runInference request/response with queue management
 * - Queue depth enforcement (max 10)
 * - Healthcheck timer and unresponsive worker termination
 * - terminate() cancellation and cleanup
 * - getQueueDepth() monitoring
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnnxWorkerBridge } from './workerBridge';
import type { TensorData } from '../types';
import type { WorkerResponse } from './workerErrors';

// --- Mock Worker ---

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private messageHandler: ((message: unknown, transfer?: Transferable[]) => void) | null = null;
  terminated = false;

  postMessage(message: unknown, transfer?: Transferable[]): void {
    if (this.terminated) {
      throw new Error('Worker is terminated');
    }
    if (this.messageHandler) {
      this.messageHandler(message, transfer);
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  // Test helpers
  onPostMessage(handler: (message: unknown, transfer?: Transferable[]) => void): void {
    this.messageHandler = handler;
  }

  simulateResponse(response: WorkerResponse): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: response }));
    }
  }

  simulateError(message: string): void {
    if (this.onerror) {
      // ErrorEvent isn't available in Node/Vitest, use a plain object
      this.onerror({ message } as unknown as ErrorEvent);
    }
  }
}

function createMockInput(size: number = 4): TensorData {
  return {
    data: new Float32Array(size).fill(1.0),
    dims: [1, size],
    dtype: 'float32',
  };
}

describe('OnnxWorkerBridge', () => {
  let mockWorker: MockWorker;
  let bridge: OnnxWorkerBridge;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWorker = new MockWorker();
    bridge = new OnnxWorkerBridge(mockWorker as unknown as Worker);
  });

  afterEach(() => {
    bridge.terminate();
    vi.advanceTimersByTime(1_000); // Allow force termination timeout to fire
    vi.useRealTimers();
  });

  describe('loadModel', () => {
    it('sends load message with model binary and hash', async () => {
      let sentMessage: unknown = null;
      mockWorker.onPostMessage((msg) => {
        sentMessage = msg;
      });

      const binary = new ArrayBuffer(1024);
      const loadPromise = bridge.loadModel(binary, 'abc123');

      // Simulate successful response
      mockWorker.simulateResponse({
        type: 'loaded',
        sessionHash: 'abc123',
        sizeBytes: 1024,
      });

      const result = await loadPromise;
      expect(result).toEqual({ sizeBytes: 1024 });
      expect(sentMessage).toMatchObject({
        type: 'load',
        modelHash: 'abc123',
      });
    });

    it('rejects on error response from worker', async () => {
      const binary = new ArrayBuffer(512);
      const loadPromise = bridge.loadModel(binary, 'bad_model');

      mockWorker.simulateResponse({
        type: 'error',
        code: 'oom',
        message: 'Out of memory',
      });

      await expect(loadPromise).rejects.toThrow('Model load failed [oom]: Out of memory');
    });

    it('rejects if worker is already terminated', async () => {
      bridge.terminate();
      const binary = new ArrayBuffer(256);
      await expect(bridge.loadModel(binary, 'hash')).rejects.toThrow('Worker has been terminated');
    });
  });

  describe('runInference', () => {
    it('sends infer message and returns TensorData on success', async () => {
      const input = createMockInput(4);
      const inferPromise = bridge.runInference('session_hash', input);

      // Simulate result
      const outputBuffer = new Float32Array([0.1, 0.2, 0.3]).buffer;
      mockWorker.simulateResponse({
        type: 'result',
        outputData: outputBuffer,
        outputDims: [1, 3],
      });

      const result = await inferPromise;
      expect(result.dims).toEqual([1, 3]);
      expect(result.dtype).toBe('float32');
      expect(result.data).toBeInstanceOf(Float32Array);
      expect(result.data.length).toBe(3);
      // Float32 precision — values won't be exact 0.1, 0.2, 0.3
      expect(result.data[0]).toBeCloseTo(0.1, 5);
      expect(result.data[1]).toBeCloseTo(0.2, 5);
      expect(result.data[2]).toBeCloseTo(0.3, 5);
    });

    it('rejects on error response', async () => {
      const input = createMockInput(4);
      const inferPromise = bridge.runInference('missing_session', input);

      mockWorker.simulateResponse({
        type: 'error',
        code: 'unknown',
        message: 'No session loaded for hash: missing_session',
      });

      await expect(inferPromise).rejects.toThrow('Inference failed [unknown]');
    });

    it('rejects if worker is already terminated', async () => {
      bridge.terminate();
      const input = createMockInput(4);
      await expect(bridge.runInference('hash', input)).rejects.toThrow('Worker has been terminated');
    });

    it('processes queued requests in FIFO order', async () => {
      const results: number[] = [];

      // First request takes processing slot
      const input1 = createMockInput(2);
      const promise1 = bridge.runInference('s1', input1);

      // Queue second request
      const input2 = createMockInput(3);
      const promise2 = bridge.runInference('s1', input2);

      // Resolve first
      const output1 = new Float32Array([1.0]).buffer;
      mockWorker.simulateResponse({
        type: 'result',
        outputData: output1,
        outputDims: [1, 1],
      });

      const r1 = await promise1;
      results.push(r1.dims[1]);

      // Resolve second (now processing)
      const output2 = new Float32Array([2.0, 3.0]).buffer;
      mockWorker.simulateResponse({
        type: 'result',
        outputData: output2,
        outputDims: [1, 2],
      });

      const r2 = await promise2;
      results.push(r2.dims[1]);

      expect(results).toEqual([1, 2]);
    });
  });

  describe('queue depth enforcement', () => {
    it('rejects requests beyond queue depth of 10', async () => {
      // First request is being processed (not in queue), so we need to
      // submit 11 total to fill the queue (1 processing + 10 queued)
      const input = createMockInput(2);

      // Submit first - it gets processed immediately
      bridge.runInference('s1', input).catch(() => {});

      // Submit 10 more to fill the queue
      for (let i = 0; i < 10; i++) {
        bridge.runInference('s1', createMockInput(2)).catch(() => {});
      }

      // 11th additional request should be rejected
      await expect(
        bridge.runInference('s1', createMockInput(2))
      ).rejects.toThrow('Inference request queue is full (max 10)');
    });

    it('allows requests after queue items are processed', async () => {
      const input = createMockInput(2);

      // Fill: 1 processing + 10 queued
      bridge.runInference('s1', input).catch(() => {});
      for (let i = 0; i < 10; i++) {
        bridge.runInference('s1', createMockInput(2)).catch(() => {});
      }

      // Queue is full
      expect(bridge.getQueueDepth()).toBe(10);

      // Process the first request
      mockWorker.simulateResponse({
        type: 'result',
        outputData: new Float32Array([1.0]).buffer,
        outputDims: [1, 1],
      });

      // Queue depth should decrease by 1 (next item moved to processing)
      expect(bridge.getQueueDepth()).toBe(9);

      // Now we can add another request
      const promise = bridge.runInference('s1', createMockInput(2));
      expect(bridge.getQueueDepth()).toBe(10);

      // Clean up - resolve remaining
      for (let i = 0; i < 11; i++) {
        mockWorker.simulateResponse({
          type: 'result',
          outputData: new Float32Array([1.0]).buffer,
          outputDims: [1, 1],
        });
      }

      await promise;
    });
  });

  describe('getQueueDepth', () => {
    it('returns 0 initially', () => {
      expect(bridge.getQueueDepth()).toBe(0);
    });

    it('counts only queued items, not the currently processing one', () => {
      const input = createMockInput(2);

      // First request goes directly to processing
      bridge.runInference('s1', input).catch(() => {});
      expect(bridge.getQueueDepth()).toBe(0);

      // Second request is queued
      bridge.runInference('s1', createMockInput(2)).catch(() => {});
      expect(bridge.getQueueDepth()).toBe(1);

      // Third
      bridge.runInference('s1', createMockInput(2)).catch(() => {});
      expect(bridge.getQueueDepth()).toBe(2);
    });
  });

  describe('healthcheck timer', () => {
    it('sends healthcheck messages at 30-second intervals', () => {
      const messages: unknown[] = [];
      mockWorker.onPostMessage((msg) => {
        messages.push(msg);
      });

      // Advance 30 seconds
      vi.advanceTimersByTime(30_000);

      const healthcheckMessages = messages.filter(
        (m) => (m as { type: string }).type === 'healthcheck'
      );
      expect(healthcheckMessages.length).toBe(1);
    });

    it('terminates worker if healthcheck is not acknowledged within interval', () => {
      // First healthcheck fires
      vi.advanceTimersByTime(30_000);

      // Don't acknowledge — advance another interval (triggers unresponsive detection)
      vi.advanceTimersByTime(30_000);

      // terminate() schedules a setTimeout(1s) for force termination
      vi.advanceTimersByTime(1_000);

      // Worker should be terminated
      expect(mockWorker.terminated).toBe(true);
    });

    it('does not terminate if healthcheck is acknowledged', () => {
      // First healthcheck fires
      vi.advanceTimersByTime(30_000);

      // Acknowledge it
      mockWorker.simulateResponse({ type: 'healthcheck_ack' });

      // Advance another interval — second healthcheck fires
      vi.advanceTimersByTime(30_000);

      // Don't acknowledge the second one, advance another interval
      vi.advanceTimersByTime(30_000);

      // terminate() schedules force termination after 1s
      vi.advanceTimersByTime(1_000);

      // NOW it should terminate because the second healthcheck wasn't acked
      expect(mockWorker.terminated).toBe(true);
    });
  });

  describe('terminate', () => {
    it('rejects all queued requests on termination', async () => {
      const input = createMockInput(2);

      // Submit requests
      const promise1 = bridge.runInference('s1', input);
      const promise2 = bridge.runInference('s1', createMockInput(2));

      bridge.terminate();

      await expect(promise1).rejects.toThrow('Worker terminated');
      await expect(promise2).rejects.toThrow('Worker terminated');
    });

    it('terminates the worker within 1 second', () => {
      bridge.terminate();

      // Worker not yet force-terminated (graceful period)
      expect(mockWorker.terminated).toBe(false);

      // After 1 second, force terminate
      vi.advanceTimersByTime(1_000);
      expect(mockWorker.terminated).toBe(true);
    });

    it('is idempotent — calling terminate twice does not throw', () => {
      bridge.terminate();
      expect(() => bridge.terminate()).not.toThrow();
    });

    it('stops healthcheck timer on termination', () => {
      bridge.terminate();

      // Advance timers — no healthcheck messages should fire
      const messages: unknown[] = [];
      mockWorker.onPostMessage((msg) => {
        messages.push(msg);
      });

      vi.advanceTimersByTime(60_000);

      const healthchecks = messages.filter(
        (m) => (m as { type: string }).type === 'healthcheck'
      );
      expect(healthchecks.length).toBe(0);
    });
  });

  describe('worker error handling', () => {
    it('rejects pending request on worker error event', async () => {
      const input = createMockInput(4);
      const inferPromise = bridge.runInference('s1', input);

      mockWorker.simulateError('WASM trap: unreachable');

      await expect(inferPromise).rejects.toThrow('Worker error: WASM trap: unreachable');
    });

    it('continues processing queue after error', async () => {
      const input1 = createMockInput(2);
      const input2 = createMockInput(3);

      const promise1 = bridge.runInference('s1', input1);
      const promise2 = bridge.runInference('s1', input2);

      // First request errors
      mockWorker.simulateError('runtime error');

      await expect(promise1).rejects.toThrow('Worker error');

      // Second request should now be processing
      const output = new Float32Array([5.0, 6.0, 7.0]).buffer;
      mockWorker.simulateResponse({
        type: 'result',
        outputData: output,
        outputDims: [1, 3],
      });

      const result = await promise2;
      expect(result.dims).toEqual([1, 3]);
    });
  });

  describe('transferable objects', () => {
    it('transfers input buffer when sending infer message', () => {
      let transferredBuffers: Transferable[] | undefined;
      mockWorker.onPostMessage((_msg, transfer) => {
        transferredBuffers = transfer;
      });

      const input = createMockInput(4);
      bridge.runInference('s1', input).catch(() => {});

      expect(transferredBuffers).toBeDefined();
      expect(transferredBuffers!.length).toBe(1);
      expect(transferredBuffers![0]).toBeInstanceOf(ArrayBuffer);
    });

    it('transfers model binary when loading', () => {
      let transferredBuffers: Transferable[] | undefined;
      mockWorker.onPostMessage((_msg, transfer) => {
        transferredBuffers = transfer;
      });

      const binary = new ArrayBuffer(2048);
      bridge.loadModel(binary, 'hash123').catch(() => {});

      expect(transferredBuffers).toBeDefined();
      expect(transferredBuffers!.length).toBe(1);
      expect(transferredBuffers![0]).toBeInstanceOf(ArrayBuffer);
    });
  });
});

describe('OnnxWorkerBridge lazy construction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not construct a Worker until the first load or infer', () => {
    const WorkerSpy = vi.fn();
    vi.stubGlobal('Worker', WorkerSpy);

    const lazy = new OnnxWorkerBridge();
    expect(lazy.hasWorker()).toBe(false);
    expect(WorkerSpy).not.toHaveBeenCalled();
    lazy.terminate();
  });

  it('constructs a Worker on first loadModel', async () => {
    vi.useFakeTimers();
    const mockWorker = new MockWorker();
    const WorkerSpy = vi.fn(() => mockWorker);
    vi.stubGlobal('Worker', WorkerSpy);

    const lazy = new OnnxWorkerBridge();
    mockWorker.onPostMessage(() => {
      mockWorker.simulateResponse({
        type: 'loaded',
        sessionHash: 'abc',
        sizeBytes: 8,
      });
    });

    const result = await lazy.loadModel(new ArrayBuffer(8), 'abc');
    expect(WorkerSpy).toHaveBeenCalledTimes(1);
    expect(lazy.hasWorker()).toBe(true);
    expect(result.sizeBytes).toBe(8);

    lazy.terminate();
    vi.advanceTimersByTime(1_000);
  });
});
