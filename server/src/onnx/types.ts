/**
 * ONNX Server-Side Types
 *
 * Interfaces for the Express 5 backend ONNX inference endpoint,
 * SSE streaming metadata, and session pool status reporting.
 */

export interface OnnxInferRequest {
  modelName: string;
  inputData: number[];
  inputDims: number[];
  /** Optional: resume from chunk index (for retry after disconnect) */
  resumeFromChunk?: number;
}

export interface OnnxInferMetadata {
  totalChunks: number;
  totalRows: number;
  modelName: string;
  outputDims: number[];
}

export interface ServerPoolStatus {
  loaded: number;
  active: number;
  queued: number;
  maxCapacity: number;
}
