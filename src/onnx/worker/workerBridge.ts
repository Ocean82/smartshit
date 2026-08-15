/**
 * ONNX Worker Bridge
 *
 * Main thread ↔ Web Worker messaging API for in-browser ONNX inference.
 * Manages request queuing (max depth 10), healthcheck monitoring (30s timeout),
 * and graceful termination.
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6
 */

import type { TensorData } from '../types';
import type { WorkerMessage, WorkerResponse } from './workerErrors';

/** Maximum number of queued inference requests */
const MAX_QUEUE_DEPTH = 10;

/** Healthcheck interval in milliseconds (30 seconds) */
const HEALTHCHECK_INTERVAL_MS = 30_000;

/** Maximum time to wait for termination (1 second) */
const TERMINATE_TIMEOUT_MS = 1_000;

interface PendingRequest {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
}

interface QueuedInference {
  sessionHash: string;
  input: TensorData;
  resolve: (value: TensorData) => void;
  reject: (reason: Error) => void;
}

export class OnnxWorkerBridge {
  private worker: Worker | null;
  private requestQueue: QueuedInference[];
  private isProcessing: boolean;
  private healthcheckTimer: ReturnType<typeof setInterval> | null;
  private healthcheckPending: boolean;
  private pendingResponse: PendingRequest | null;
  private terminated: boolean;

  constructor(worker?: Worker) {
    // Injected workers (tests) start immediately. Production constructs the
    // Worker lazily on first load/infer so app startup does not fetch onnxruntime.
    this.worker = worker ?? null;
    this.requestQueue = [];
    this.isProcessing = false;
    this.healthcheckTimer = null;
    this.healthcheckPending = false;
    this.pendingResponse = null;
    this.terminated = false;

    if (this.worker) {
      this.attachWorker(this.worker);
      this.startHealthcheck();
    }
  }

  /** True when the underlying Worker has been created. */
  hasWorker(): boolean {
    return this.worker !== null;
  }

  /**
   * Loads a model into the Web Worker.
   * Sends the model binary as a transferable object.
   */
  async loadModel(binary: ArrayBuffer, hash: string): Promise<{ sizeBytes: number }> {
    if (this.terminated) {
      throw new Error('Worker has been terminated');
    }

    const worker = this.ensureWorker();

    return new Promise<{ sizeBytes: number }>((resolve, reject) => {
      this.pendingResponse = {
        resolve: (response: WorkerResponse) => {
          if (response.type === 'loaded') {
            resolve({ sizeBytes: response.sizeBytes });
          } else if (response.type === 'error') {
            reject(new Error(`Model load failed [${response.code}]: ${response.message}`));
          } else {
            reject(new Error(`Unexpected response type: ${response.type}`));
          }
        },
        reject,
      };

      const message: WorkerMessage = {
        type: 'load',
        modelBinary: binary,
        modelHash: hash,
      };

      worker.postMessage(message, [binary]);
    });
  }

  /**
   * Runs inference on a loaded session.
   * Queues the request if the worker is busy. Rejects if queue exceeds max depth of 10.
   */
  async runInference(sessionHash: string, input: TensorData): Promise<TensorData> {
    if (this.terminated) {
      throw new Error('Worker has been terminated');
    }

    if (this.requestQueue.length >= MAX_QUEUE_DEPTH) {
      throw new Error('Inference request queue is full (max 10)');
    }

    this.ensureWorker();

    return new Promise<TensorData>((resolve, reject) => {
      const queuedRequest: QueuedInference = {
        sessionHash,
        input,
        resolve,
        reject,
      };

      this.requestQueue.push(queuedRequest);
      this.processNextInQueue();
    });
  }

  /**
   * Terminates the worker. Rejects all pending and queued requests.
   * Ensures termination completes within 1 second.
   */
  terminate(): void {
    if (this.terminated) {
      return;
    }

    this.terminated = true;
    this.stopHealthcheck();

    // Reject all queued requests
    const queuedRequests = [...this.requestQueue];
    this.requestQueue = [];
    for (const request of queuedRequests) {
      request.reject(new Error('Worker terminated'));
    }

    // Reject pending response
    if (this.pendingResponse) {
      this.pendingResponse.reject(new Error('Worker terminated'));
      this.pendingResponse = null;
    }

    const worker = this.worker;
    if (!worker) {
      return;
    }

    // Send terminate message and force-terminate after timeout
    const terminateMessage: WorkerMessage = { type: 'terminate' };
    try {
      worker.postMessage(terminateMessage);
    } catch {
      // Worker may already be terminated
    }

    // Force terminate the worker within 1 second
    setTimeout(() => {
      try {
        worker.terminate();
      } catch {
        // Already terminated
      }
    }, TERMINATE_TIMEOUT_MS);
  }

  /**
   * Returns the current number of queued inference requests.
   */
  getQueueDepth(): number {
    return this.requestQueue.length;
  }

  // --- Private Methods ---

  private attachWorker(worker: Worker): void {
    worker.onmessage = this.handleWorkerMessage.bind(this);
    worker.onerror = this.handleWorkerError.bind(this);
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }
    if (typeof Worker === 'undefined') {
      throw new Error('Web Worker is not available in this environment');
    }
    this.worker = new Worker(
      new URL('./onnx.worker.ts', import.meta.url),
      { type: 'module' }
    );
    this.attachWorker(this.worker);
    this.startHealthcheck();
    return this.worker;
  }

  private handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;

    // Handle healthcheck acknowledgment
    if (response.type === 'healthcheck_ack') {
      this.healthcheckPending = false;
      return;
    }

    // Handle pending load or inference response
    if (this.pendingResponse) {
      const pending = this.pendingResponse;
      this.pendingResponse = null;
      pending.resolve(response);
      return;
    }
  }

  private handleWorkerError(event: ErrorEvent): void {
    // Reject the current pending request on worker error
    if (this.pendingResponse) {
      const pending = this.pendingResponse;
      this.pendingResponse = null;
      pending.reject(new Error(`Worker error: ${event.message}`));
    }

    // Also reject the current processing item (if it maps to a queued inference)
    this.isProcessing = false;
    this.processNextInQueue();
  }

  private processNextInQueue(): void {
    if (this.isProcessing || this.requestQueue.length === 0 || this.terminated) {
      return;
    }

    this.isProcessing = true;
    const request = this.requestQueue.shift()!;

    // Convert TensorData to transferable ArrayBuffer
    const inputBuffer = (request.input.data.buffer as ArrayBuffer).slice(
      request.input.data.byteOffset,
      request.input.data.byteOffset + request.input.data.byteLength
    );

    this.pendingResponse = {
      resolve: (response: WorkerResponse) => {
        this.isProcessing = false;

        if (response.type === 'result') {
          // Reconstruct TensorData from the transferred ArrayBuffer
          const outputData = new Float32Array(response.outputData);
          const result: TensorData = {
            data: outputData,
            dims: response.outputDims,
            dtype: 'float32',
          };
          request.resolve(result);
        } else if (response.type === 'error') {
          request.reject(new Error(`Inference failed [${response.code}]: ${response.message}`));
        } else {
          request.reject(new Error(`Unexpected response type: ${response.type}`));
        }

        // Process next in queue
        this.processNextInQueue();
      },
      reject: (reason: Error) => {
        this.isProcessing = false;
        request.reject(reason);
        this.processNextInQueue();
      },
    };

    const message: WorkerMessage = {
      type: 'infer',
      sessionHash: request.sessionHash,
      inputData: inputBuffer,
      inputDims: request.input.dims,
    };

    this.ensureWorker().postMessage(message, [inputBuffer]);
  }

  private startHealthcheck(): void {
    this.healthcheckTimer = setInterval(() => {
      if (this.terminated) {
        this.stopHealthcheck();
        return;
      }

      if (this.healthcheckPending) {
        // Previous healthcheck wasn't acknowledged — worker is unresponsive
        this.handleUnresponsiveWorker();
        return;
      }

      if (!this.worker) {
        return;
      }

      this.healthcheckPending = true;
      const message: WorkerMessage = { type: 'healthcheck' };
      try {
        this.worker.postMessage(message);
      } catch {
        this.handleUnresponsiveWorker();
      }
    }, HEALTHCHECK_INTERVAL_MS);
  }

  private stopHealthcheck(): void {
    if (this.healthcheckTimer !== null) {
      clearInterval(this.healthcheckTimer);
      this.healthcheckTimer = null;
    }
  }

  private handleUnresponsiveWorker(): void {
    this.stopHealthcheck();
    this.terminate();
  }
}
