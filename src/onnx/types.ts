/**
 * ONNX Module - Shared Types
 *
 * Core interfaces for the ONNX model integration dual-path architecture.
 * Used across client-side modules: routing, validation, caching, and formula execution.
 */

export interface ModelAsset {
  /** User-assigned name (1–64 alphanumeric/underscore chars) */
  name: string;
  /** SHA-256 hash of the model binary */
  hash: string;
  /** Model file size in bytes */
  sizeBytes: number;
  /** ONNX opset version */
  opsetVersion: number;
  /** Expected input tensor shape (e.g. [-1, 4] for batch×features) */
  inputShape: number[];
  /** Expected input tensor element type (e.g. 'float32') */
  inputDtype: 'float32' | 'float64' | 'int32' | 'int64';
  /** Expected output tensor shape */
  outputShape: number[];
  /** Timestamp of registration */
  registeredAt: number;
  /** Whether this model is marked as frequently used (server pool hint) */
  frequentlyUsed: boolean;
}

export interface TensorData {
  /** Flat typed array of values */
  data: Float32Array | Float64Array | Int32Array;
  /** Shape dimensions */
  dims: number[];
  /** Element type */
  dtype: 'float32' | 'float64' | 'int32' | 'int64';
}

export type ExecutionPath = 'local' | 'server';

export interface RoutingDecision {
  path: ExecutionPath;
  reason: string;
  /** Whether this was a fallback from the opposite path */
  isFallback: boolean;
}

export interface InferenceRequest {
  modelName: string;
  inputTensor: TensorData;
  /** Cell reference where the formula lives */
  originCell: string;
  /** Expected spill dimensions for multi-value output */
  spillDims?: { rows: number; cols: number };
}

export interface InferenceResult {
  outputTensor: TensorData;
  executionTimeMs: number;
  path: ExecutionPath;
}

export interface SSEChunk {
  type: 'metadata' | 'chunk' | 'done' | 'error' | 'queue';
  index?: number;
  totalChunks?: number;
  totalRows?: number;
  data?: number[];
  error?: string;
  estimatedWaitSeconds?: number;
}

export interface ValidationError {
  cellId: string;
  value: unknown;
  reason: 'non_numeric' | 'nan' | 'empty' | 'formula_error' | 'shape_mismatch';
  message: string;
}

export interface SessionCacheEntry {
  hash: string;
  session: unknown; // ort.InferenceSession at runtime
  sizeBytes: number;
  lastUsedAt: number;
  isExecuting: boolean;
}
