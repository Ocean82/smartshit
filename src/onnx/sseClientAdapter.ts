/**
 * SSE Client Adapter
 *
 * Adapts the SSE client's `runServerInference` (which takes options and
 * returns {promise, handle}) to the simpler signature expected by
 * OnnxFunctionDeps: (modelName, tensor) => Promise<InferenceResult>.
 *
 * This is the bridge between the formula function's dependency interface
 * and the full-featured SSE streaming client.
 */

import type { TensorData, InferenceResult } from './types';
import { runServerInference as sseRunServerInference } from './sseClient';
import { canCallServer } from '@/lib/serverAccess';
import { ANON_ONNX_MESSAGE } from '@/auth/anonCopy';

/** Thrown (without any request) when server ONNX inference is attempted anonymously. */
export class AnonymousServerError extends Error {
  constructor() {
    super(ANON_ONNX_MESSAGE);
    this.name = 'AnonymousServerError';
  }
}

/**
 * Runs server-side inference via the SSE client.
 * Simplified interface matching OnnxFunctionDeps.runServerInference.
 *
 * @param modelName - The model asset name to infer with
 * @param tensor - The input tensor data
 * @returns Promise resolving to the full InferenceResult
 */
export async function runServerInference(
  modelName: string,
  tensor: TensorData,
): Promise<InferenceResult> {
  if (!canCallServer()) throw new AnonymousServerError();
  const { promise } = sseRunServerInference({
    modelName,
    inputTensor: tensor,
  });

  return promise;
}
