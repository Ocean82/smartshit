/**
 * ONNX Web Worker Entry Point
 *
 * Dedicated Web Worker that runs ONNX Runtime Web inference in isolation
 * from the main UI thread. Manages loaded InferenceSessions keyed by model hash
 * and handles load, infer, healthcheck, and terminate messages.
 *
 * Requirements: 2.1, 2.4, 1.1, 1.2, 1.6
 */

import * as ort from 'onnxruntime-web';
import { classifyError } from './workerErrors';
import type { WorkerMessage, WorkerResponse } from './workerErrors';

export type { WorkerMessage, WorkerResponse, ErrorCode } from './workerErrors';
export { classifyError } from './workerErrors';

// --- Session Storage ---

const sessions = new Map<string, ort.InferenceSession>();

// --- Message Handlers ---

/**
 * Handles a 'load' message: creates an InferenceSession from the provided model binary.
 */
async function handleLoad(modelBinary: ArrayBuffer, modelHash: string): Promise<WorkerResponse> {
  try {
    const session = await ort.InferenceSession.create(
      new Uint8Array(modelBinary),
      { executionProviders: ['wasm'] }
    );

    sessions.set(modelHash, session);

    return {
      type: 'loaded',
      sessionHash: modelHash,
      sizeBytes: modelBinary.byteLength,
    };
  } catch (error: unknown) {
    const classified = classifyError(error);
    return { type: 'error', code: classified.code, message: classified.message };
  }
}

/**
 * Handles an 'infer' message: runs inference on the loaded session with the provided input tensor.
 * Returns the output as a transferable ArrayBuffer.
 */
async function handleInfer(
  sessionHash: string,
  inputData: ArrayBuffer,
  inputDims: number[]
): Promise<{ response: WorkerResponse; transfer?: ArrayBuffer[] }> {
  const session = sessions.get(sessionHash);
  if (!session) {
    return {
      response: {
        type: 'error',
        code: 'unknown',
        message: `No session loaded for hash: ${sessionHash}`,
      },
    };
  }

  try {
    // Create input tensor from the provided ArrayBuffer
    const inputArray = new Float32Array(inputData);
    const inputTensor = new ort.Tensor('float32', inputArray, inputDims);

    // Get the first input name from the session
    const inputNames = session.inputNames;
    if (inputNames.length === 0) {
      return {
        response: {
          type: 'error',
          code: 'unknown',
          message: 'Model has no input names defined',
        },
      };
    }

    const feeds: Record<string, ort.Tensor> = {
      [inputNames[0]]: inputTensor,
    };

    // Run inference
    const results = await session.run(feeds);

    // Extract first output
    const outputNames = session.outputNames;
    if (outputNames.length === 0) {
      return {
        response: {
          type: 'error',
          code: 'unknown',
          message: 'Model has no output names defined',
        },
      };
    }

    const outputTensor = results[outputNames[0]];
    const outputData = outputTensor.data as Float32Array;
    const outputDims = outputTensor.dims as number[];

    // Copy output data into a transferable ArrayBuffer
    const outputBuffer = (outputData.buffer as ArrayBuffer).slice(
      outputData.byteOffset,
      outputData.byteOffset + outputData.byteLength
    );

    return {
      response: {
        type: 'result',
        outputData: outputBuffer,
        outputDims,
      },
      transfer: [outputBuffer],
    };
  } catch (error: unknown) {
    const classified = classifyError(error);
    return {
      response: { type: 'error', code: classified.code, message: classified.message },
    };
  }
}

/**
 * Handles a 'terminate' message: disposes all sessions and closes the worker.
 */
async function handleTerminate(): Promise<void> {
  for (const [hash, session] of sessions) {
    try {
      await session.release();
    } catch {
      // Best-effort disposal — ignore errors during cleanup
    }
    sessions.delete(hash);
  }
  self.close();
}

// --- Main Message Listener ---

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'load': {
      const response = await handleLoad(message.modelBinary, message.modelHash);
      self.postMessage(response);
      break;
    }

    case 'infer': {
      const { response, transfer } = await handleInfer(
        message.sessionHash,
        message.inputData,
        message.inputDims
      );
      if (transfer && transfer.length > 0) {
        self.postMessage(response, { transfer });
      } else {
        self.postMessage(response);
      }
      break;
    }

    case 'healthcheck': {
      const response: WorkerResponse = { type: 'healthcheck_ack' };
      self.postMessage(response);
      break;
    }

    case 'terminate': {
      await handleTerminate();
      break;
    }

    default: {
      const response: WorkerResponse = {
        type: 'error',
        code: 'unknown',
        message: `Unknown message type: ${(message as { type: string }).type}`,
      };
      self.postMessage(response);
      break;
    }
  }
};
