/**
 * Property-Based Tests for OnnxWorkerBridge Queue Depth Enforcement
 *
 * Property 17: Worker Queue Depth Enforcement
 * For any sequence of inference requests submitted while the Web Worker is busy,
 * the queue SHALL accept up to 10 requests in FIFO order and reject any request
 * beyond the 10th.
 *
 * **Validates: Requirements 2.5, 2.6**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { OnnxWorkerBridge } from './workerBridge';
import type { TensorData } from '../types';
import type { WorkerResponse } from './workerErrors';

// --- Mock Worker (same pattern as unit tests) ---

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  postMessage(_message: unknown, _transfer?: Transferable[]): void {
    if (this.terminated) {
      throw new Error('Worker is terminated');
    }
  }

  terminate(): void {
    this.terminated = true;
  }

  simulateResponse(response: WorkerResponse): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: response }));
    }
  }
}

function createMockInput(size: number): TensorData {
  return {
    data: new Float32Array(size).fill(1.0),
    dims: [1, size],
    dtype: 'float32',
  };
}

function makeSuccessResponse(outputSize: number): WorkerResponse {
  return {
    type: 'result',
    outputData: new Float32Array(outputSize).buffer,
    outputDims: [1, outputSize],
  };
}

describe('Property 17: Worker Queue Depth Enforcement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.advanceTimersByTime(1_000);
    vi.useRealTimers();
  });

  it('accepts up to 10 queued requests and rejects beyond the 10th', () => {
    fc.assert(
      fc.property(
        // Total number of additional requests to submit while worker is busy (1..25)
        fc.integer({ min: 1, max: 25 }),
        (totalAdditionalRequests) => {
          const worker = new MockWorker();
          const bridge = new OnnxWorkerBridge(worker as unknown as Worker);

          try {
            // Submit the first request — goes directly to processing (queue depth stays 0)
            bridge.runInference('session', createMockInput(2)).catch(() => {});

            // Worker is now busy (isProcessing = true, queue empty)
            expect(bridge.getQueueDepth()).toBe(0);

            // Submit additional requests that will accumulate in the queue
            for (let i = 0; i < totalAdditionalRequests; i++) {
              bridge.runInference('session', createMockInput(2)).catch(() => {});
            }

            // The queue accepts up to 10. Requests beyond 10 get rejected promises
            // but don't occupy queue space.
            const expectedQueueDepth = Math.min(totalAdditionalRequests, 10);
            expect(bridge.getQueueDepth()).toBe(expectedQueueDepth);
          } finally {
            bridge.terminate();
            vi.advanceTimersByTime(1_000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects requests beyond the 10th with queue full error', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Number of overflow requests beyond the 10 allowed (1..10)
        fc.integer({ min: 1, max: 10 }),
        async (overflowCount) => {
          const worker = new MockWorker();
          const bridge = new OnnxWorkerBridge(worker as unknown as Worker);

          try {
            // Fill: 1 processing + 10 queued
            bridge.runInference('session', createMockInput(2)).catch(() => {});
            for (let i = 0; i < 10; i++) {
              bridge.runInference('session', createMockInput(2)).catch(() => {});
            }

            expect(bridge.getQueueDepth()).toBe(10);

            // Each overflow request should be rejected with queue full error
            for (let i = 0; i < overflowCount; i++) {
              await expect(
                bridge.runInference('session', createMockInput(2))
              ).rejects.toThrow('Inference request queue is full (max 10)');
            }

            // Queue depth unchanged
            expect(bridge.getQueueDepth()).toBe(10);
          } finally {
            bridge.terminate();
            vi.advanceTimersByTime(1_000);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('processes queued requests in FIFO order', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate between 2 and 10 requests to queue (all within limit)
        fc.integer({ min: 2, max: 10 }),
        async (queueSize) => {
          const worker = new MockWorker();
          const bridge = new OnnxWorkerBridge(worker as unknown as Worker);

          try {
            // First request goes to processing immediately
            const firstPromise = bridge.runInference('session', createMockInput(1));

            // Queue additional requests, each with a distinct tensor size as tag
            const queuedPromises: Promise<TensorData>[] = [];
            for (let i = 0; i < queueSize; i++) {
              const tensorSize = i + 10; // Distinct sizes: 10, 11, 12, ...
              queuedPromises.push(
                bridge.runInference('session', createMockInput(tensorSize))
              );
            }

            expect(bridge.getQueueDepth()).toBe(queueSize);

            // Resolve the first (processing) request
            worker.simulateResponse(makeSuccessResponse(1));
            const firstResult = await firstPromise;
            expect(firstResult.dims[1]).toBe(1);

            // Resolve each queued request in sequence
            const completionOrder: number[] = [];
            for (let i = 0; i < queueSize; i++) {
              const expectedSize = i + 10;
              worker.simulateResponse(makeSuccessResponse(expectedSize));
              const result = await queuedPromises[i];
              completionOrder.push(result.dims[1]);
            }

            // Verify FIFO: results come back in submission order
            const expectedOrder = Array.from({ length: queueSize }, (_, i) => i + 10);
            expect(completionOrder).toEqual(expectedOrder);
          } finally {
            bridge.terminate();
            vi.advanceTimersByTime(1_000);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('queue opens up space after items are processed', () => {
    fc.assert(
      fc.property(
        // Number of items to drain from a full queue (1 to 10)
        fc.integer({ min: 1, max: 10 }),
        // Number of new items to submit after draining (1 to 15)
        fc.integer({ min: 1, max: 15 }),
        (drainCount, newSubmitCount) => {
          const worker = new MockWorker();
          const bridge = new OnnxWorkerBridge(worker as unknown as Worker);

          try {
            // Fill the queue: 1 processing + 10 queued
            bridge.runInference('session', createMockInput(1)).catch(() => {});
            for (let i = 0; i < 10; i++) {
              bridge.runInference('session', createMockInput(2)).catch(() => {});
            }

            expect(bridge.getQueueDepth()).toBe(10);

            // Drain items by resolving
            for (let i = 0; i < drainCount; i++) {
              worker.simulateResponse(makeSuccessResponse(1));
            }

            // Queue depth decreases as items are resolved
            const depthAfterDrain = 10 - drainCount;
            expect(bridge.getQueueDepth()).toBe(depthAfterDrain);

            // Submit new requests — queue can accept up to (10 - depthAfterDrain) more
            for (let i = 0; i < newSubmitCount; i++) {
              bridge.runInference('session', createMockInput(3)).catch(() => {});
            }

            // Queue fills back up to at most 10
            const expectedFinalDepth = Math.min(depthAfterDrain + newSubmitCount, 10);
            expect(bridge.getQueueDepth()).toBe(expectedFinalDepth);
          } finally {
            bridge.terminate();
            vi.advanceTimersByTime(1_000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('queue depth invariant: always stays within [0, 10] regardless of request pattern', () => {
    fc.assert(
      fc.property(
        // Generate a sequence of actions: 'submit' or 'resolve'
        fc.array(
          fc.oneof(
            fc.constant('submit' as const),
            fc.constant('resolve' as const)
          ),
          { minLength: 10, maxLength: 50 }
        ),
        (actions) => {
          const worker = new MockWorker();
          const bridge = new OnnxWorkerBridge(worker as unknown as Worker);

          try {
            let hasProcessingItem = false;

            for (const action of actions) {
              if (action === 'submit') {
                bridge.runInference('session', createMockInput(2)).catch(() => {});
                if (!hasProcessingItem) {
                  hasProcessingItem = true;
                }
              } else if (action === 'resolve' && hasProcessingItem) {
                worker.simulateResponse(makeSuccessResponse(1));
                if (bridge.getQueueDepth() === 0) {
                  hasProcessingItem = false;
                }
              }

              // INVARIANT: queue depth is always between 0 and 10
              const depth = bridge.getQueueDepth();
              expect(depth).toBeGreaterThanOrEqual(0);
              expect(depth).toBeLessThanOrEqual(10);
            }
          } finally {
            bridge.terminate();
            vi.advanceTimersByTime(1_000);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
