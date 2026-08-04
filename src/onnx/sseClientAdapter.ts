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
  const { promise } = sseRunServerInference({
    modelName,
    inputTensor: tensor,
  });

  return promise;
}
