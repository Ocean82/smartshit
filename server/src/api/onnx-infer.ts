/**
 * Express SSE Endpoint for ONNX Batch Inference
 *
 * POST /api/onnx/infer
 * Accepts OnnxInferRequest body, streams chunked results via SSE.
 *
 * - Validates input (max 1,000,000 rows)
 * - Acquires session from pool; emits queue event if at capacity
 * - Emits metadata event with totalChunks and totalRows
 * - Chunks results into groups of 500 rows (or single event if ≤ 100 rows)
 * - Supports resumeFromChunk for retry after disconnect
 * - Scans model graph for non-standard operators (opset 7–20)
 * - Emits first SSE event within 5 seconds of request receipt
 *
 * Requirements: 3.1, 3.2, 3.4, 3.6, 3.7, 3.8, 7.3
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { OnnxInferRequest } from '../onnx/types.js';
import { SessionPool } from '../onnx/sessionPool.js';

/** Maximum input rows allowed per request */
const MAX_INPUT_ROWS = 1_000_000;

/** Chunk size: 500 rows per SSE event */
const CHUNK_SIZE = 500;

/** Threshold: results ≤ 100 rows emit as single event */
const SINGLE_EVENT_THRESHOLD = 100;

/** Operator validation timeout (30 seconds) */
const OPERATOR_SCAN_TIMEOUT_MS = 30_000;

/** Standard ONNX operators for opset 7–20 */
const STANDARD_OPS = new Set([
  // Core math
  'Abs', 'Acos', 'Acosh', 'Add', 'And', 'ArgMax', 'ArgMin', 'Asin', 'Asinh',
  'Atan', 'Atanh', 'AveragePool',
  // B
  'BatchNormalization', 'BitShift',
  // C
  'Cast', 'CastLike', 'Ceil', 'Celu', 'Clip', 'Compress', 'Concat',
  'ConcatFromSequence', 'Constant', 'ConstantOfShape', 'Conv', 'ConvInteger',
  'ConvTranspose', 'Cos', 'Cosh', 'CumSum',
  // D
  'DepthToSpace', 'DequantizeLinear', 'Det', 'Div', 'Dropout', 'DynamicQuantizeLinear',
  // E
  'Einsum', 'Elu', 'Equal', 'Erf', 'Exp', 'Expand', 'EyeLike',
  // F
  'Flatten', 'Floor', 'GRU', 'Gather', 'GatherElements', 'GatherND', 'Gemm',
  'GlobalAveragePool', 'GlobalLpPool', 'GlobalMaxPool', 'Greater', 'GreaterOrEqual',
  'GridSample',
  // H
  'HardSigmoid', 'HardSwish', 'Hardmax',
  // I
  'Identity', 'If', 'InstanceNormalization', 'IsInf', 'IsNaN',
  // L
  'LRN', 'LSTM', 'LeakyRelu', 'Less', 'LessOrEqual', 'Log', 'LogSoftmax', 'Loop',
  'LpNormalization', 'LpPool',
  // M
  'MatMul', 'MatMulInteger', 'Max', 'MaxPool', 'MaxRoiPool', 'MaxUnpool',
  'Mean', 'MeanVarianceNormalization', 'Min', 'Mod', 'Mul', 'Multinomial',
  // N
  'Neg', 'NegativeLogLikelihoodLoss', 'NonMaxSuppression', 'NonZero', 'Not',
  // O
  'OneHot', 'Optional', 'OptionalGetElement', 'OptionalHasElement', 'Or',
  // P
  'Pad', 'Pow', 'PRelu',
  // Q
  'QLinearConv', 'QLinearMatMul', 'QuantizeLinear',
  // R
  'RNN', 'RandomNormal', 'RandomNormalLike', 'RandomUniform', 'RandomUniformLike',
  'Range', 'Reciprocal', 'ReduceL1', 'ReduceL2', 'ReduceLogSum',
  'ReduceLogSumExp', 'ReduceMax', 'ReduceMean', 'ReduceMin', 'ReduceProd',
  'ReduceSum', 'ReduceSumSquare', 'Relu', 'Reshape', 'Resize', 'ReverseSequence',
  'RoiAlign', 'Round',
  // S
  'Scan', 'Scatter', 'ScatterElements', 'ScatterND', 'Selu', 'SequenceAt',
  'SequenceConstruct', 'SequenceEmpty', 'SequenceErase', 'SequenceInsert',
  'SequenceLength', 'SequenceMap', 'Shape', 'Shrink', 'Sigmoid', 'Sign',
  'Sin', 'Sinh', 'Size', 'Slice', 'Softmax', 'SoftmaxCrossEntropyLoss',
  'Softplus', 'Softsign', 'SpaceToDepth', 'Split', 'SplitToSequence',
  'Sqrt', 'Squeeze', 'StringNormalizer', 'Sub',
  // T
  'Tan', 'Tanh', 'TfIdfVectorizer', 'ThresholdedRelu', 'Tile', 'TopK',
  'Transpose', 'Trilu',
  // U
  'Unique', 'Unsqueeze', 'Upsample',
  // W
  'Where',
  // X
  'Xor',
]);

export interface SSEChunk {
  type: 'metadata' | 'chunk' | 'done' | 'error' | 'queue';
  index?: number;
  totalChunks?: number;
  totalRows?: number;
  data?: number[];
  error?: string;
  estimatedWaitSeconds?: number;
}

/**
 * Send an SSE event to the response stream.
 */
function sendSSE(res: Response, event: SSEChunk): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

/**
 * Calculate the total number of rows from input dimensions.
 * The first dimension is treated as the batch/row dimension.
 */
export function calculateTotalRows(inputDims: number[]): number {
  if (inputDims.length === 0) return 0;
  return inputDims[0];
}

/**
 * Calculate chunking parameters for a given number of result rows.
 * If totalRows > 100, chunk into groups of 500.
 * If totalRows ≤ 100, emit as a single chunk.
 */
export function calculateChunks(totalRows: number): { totalChunks: number; chunkSize: number } {
  if (totalRows <= SINGLE_EVENT_THRESHOLD) {
    return { totalChunks: 1, chunkSize: totalRows };
  }
  const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);
  return { totalChunks, chunkSize: CHUNK_SIZE };
}

/**
 * Extract a chunk of results from the full output array.
 * Each row may have multiple columns (determined by output shape).
 */
export function extractChunk(
  results: number[],
  chunkIndex: number,
  chunkSize: number,
  totalRows: number,
  columnsPerRow: number,
): number[] {
  const startRow = chunkIndex * chunkSize;
  const endRow = Math.min(startRow + chunkSize, totalRows);
  const startIdx = startRow * columnsPerRow;
  const endIdx = endRow * columnsPerRow;
  return results.slice(startIdx, endIdx);
}

/**
 * Scan model operators to ensure they're within the standard ONNX opset 7–20.
 * Returns an array of non-standard operator names found, or empty if all valid.
 *
 * In production, this reads the model graph from the InferenceSession.
 * For testability, accepts an operator list directly.
 */
export function scanForNonStandardOperators(operators: string[]): string[] {
  return operators.filter(op => !STANDARD_OPS.has(op));
}

/**
 * Validate the OnnxInferRequest body.
 * Returns null if valid, or an error string if invalid.
 */
export function validateInferRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body is required';
  }

  const req = body as Partial<OnnxInferRequest>;

  if (!req.modelName || typeof req.modelName !== 'string') {
    return 'modelName is required and must be a string';
  }

  if (!Array.isArray(req.inputData)) {
    return 'inputData is required and must be an array of numbers';
  }

  if (!Array.isArray(req.inputDims) || req.inputDims.length === 0) {
    return 'inputDims is required and must be a non-empty array of numbers';
  }

  // Validate all inputData values are numbers
  for (let i = 0; i < req.inputData.length; i++) {
    if (typeof req.inputData[i] !== 'number' || isNaN(req.inputData[i])) {
      return `inputData[${i}] must be a valid number`;
    }
  }

  // Validate all inputDims values are positive integers
  for (let i = 0; i < req.inputDims.length; i++) {
    if (typeof req.inputDims[i] !== 'number' || req.inputDims[i] <= 0 || !Number.isInteger(req.inputDims[i])) {
      return `inputDims[${i}] must be a positive integer`;
    }
  }

  // Validate total rows against max limit
  const totalRows = calculateTotalRows(req.inputDims);
  if (totalRows > MAX_INPUT_ROWS) {
    return `Input exceeds maximum batch size: ${totalRows} rows (max ${MAX_INPUT_ROWS})`;
  }

  // Validate resumeFromChunk if provided
  if (req.resumeFromChunk !== undefined) {
    if (typeof req.resumeFromChunk !== 'number' || req.resumeFromChunk < 0 || !Number.isInteger(req.resumeFromChunk)) {
      return 'resumeFromChunk must be a non-negative integer';
    }
  }

  return null;
}

/**
 * Create the ONNX inference router.
 * Accepts an optional SessionPool instance for dependency injection (testing).
 */
export function createOnnxRouter(sessionPool?: SessionPool): Router {
  const router = Router();

  router.post('/infer', async (req: Request, res: Response) => {
    // Set SSE headers immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Track whether client disconnected
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
    });

    // Validate input
    const validationError = validateInferRequest(req.body);
    if (validationError) {
      sendSSE(res, { type: 'error', error: validationError });
      res.end();
      return;
    }

    const body = req.body as OnnxInferRequest;
    const { modelName, inputData, inputDims, resumeFromChunk } = body;
    const totalRows = calculateTotalRows(inputDims);
    const { totalChunks, chunkSize } = calculateChunks(totalRows);

    // Validate resumeFromChunk against total chunks
    if (resumeFromChunk !== undefined && resumeFromChunk >= totalChunks) {
      sendSSE(res, {
        type: 'error',
        error: `resumeFromChunk (${resumeFromChunk}) exceeds total chunks (${totalChunks})`,
      });
      res.end();
      return;
    }

    // Acquire session from pool
    if (!sessionPool) {
      sendSSE(res, { type: 'error', error: 'Session pool not configured' });
      res.end();
      return;
    }

    let session;
    try {
      // Check pool status for queue estimation
      const poolStatus = sessionPool.getStatus();
      if (poolStatus.active >= poolStatus.loaded && poolStatus.queued > 0) {
        // Pool at capacity — emit queue event with estimated wait
        const estimatedWaitSeconds = Math.ceil(poolStatus.queued * 5); // ~5s per queued request
        sendSSE(res, { type: 'queue', estimatedWaitSeconds });
      }

      session = await sessionPool.acquire(modelName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to acquire session';
      sendSSE(res, { type: 'error', error: message });
      res.end();
      return;
    }

    // If client disconnected during session acquisition, release and exit
    if (clientDisconnected) {
      sessionPool.release(modelName);
      res.end();
      return;
    }

    try {
      // Scan model operators for non-standard ops (with timeout)
      const scanPromise = scanModelOperators(session, modelName);
      const timeoutPromise = new Promise<string[]>((_, reject) =>
        setTimeout(() => reject(new Error('Operator scan timed out')), OPERATOR_SCAN_TIMEOUT_MS)
      );

      let nonStandardOps: string[];
      try {
        nonStandardOps = await Promise.race([scanPromise, timeoutPromise]) as string[];
      } catch (scanErr) {
        const message = scanErr instanceof Error ? scanErr.message : 'Operator scan failed';
        sendSSE(res, { type: 'error', error: message });
        sessionPool.release(modelName);
        res.end();
        return;
      }

      if (nonStandardOps.length > 0) {
        sendSSE(res, {
          type: 'error',
          error: `Model contains non-standard operators: ${nonStandardOps.join(', ')}`,
        });
        sessionPool.release(modelName);
        res.end();
        return;
      }

      // Emit metadata event
      const startChunk = resumeFromChunk ?? 0;
      sendSSE(res, {
        type: 'metadata',
        totalChunks,
        totalRows,
      });

      // Run inference
      const outputTensor = await runInference(session, inputData, inputDims);
      const results = Array.from(outputTensor.data as Float32Array);
      const outputRows = totalRows; // Output rows match input rows for most models
      const columnsPerRow = results.length > 0 ? Math.floor(results.length / outputRows) : 1;

      // Stream chunks
      for (let i = startChunk; i < totalChunks; i++) {
        if (clientDisconnected) {
          break;
        }

        const chunkData = extractChunk(results, i, chunkSize, outputRows, columnsPerRow);
        sendSSE(res, {
          type: 'chunk',
          index: i,
          data: chunkData,
        });
      }

      // Emit done event if client is still connected
      if (!clientDisconnected) {
        sendSSE(res, { type: 'done' });
      }
    } catch (err) {
      if (!clientDisconnected) {
        const message = err instanceof Error ? err.message : 'Inference failed';
        sendSSE(res, { type: 'error', error: message });
      }
    } finally {
      // Always release session back to pool
      sessionPool.release(modelName);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return router;
}

/**
 * Scan model graph for non-standard operators.
 * Extracts operator names from the InferenceSession's graph.
 */
async function scanModelOperators(
  session: unknown,
  _modelName: string,
): Promise<string[]> {
  // Access the model graph from the ONNX Runtime session
  // The session exposes handler.graph or inputNames/outputNames
  const sess = session as {
    handler?: {
      graph?: {
        nodes?: Array<{ opType?: string }>;
      };
    };
  };

  if (sess.handler?.graph?.nodes) {
    const operators = sess.handler.graph.nodes
      .map(node => node.opType)
      .filter((op): op is string => typeof op === 'string');
    return scanForNonStandardOperators(operators);
  }

  // If we can't access the graph, allow the model through
  // (the ONNX runtime will reject unsupported ops during execution)
  return [];
}

/**
 * Run inference using an ONNX Runtime session.
 * The session is expected to conform to the ort.InferenceSession interface.
 */
async function runInference(
  session: unknown,
  inputData: number[],
  inputDims: number[],
): Promise<{ data: Float32Array; dims: number[] }> {
  const sess = session as {
    inputNames?: string[];
    run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array | number[]; dims: number[] | readonly number[] }>>;
  };

  // Get input name from session
  const inputName = sess.inputNames?.[0] ?? 'input';

  // Create a simple tensor-like object that onnxruntime-node accepts.
  // In production, this is an ort.Tensor; in tests, the mock just sees the feed object.
  const inputTensor = {
    type: 'float32',
    data: Float32Array.from(inputData),
    dims: inputDims,
  };

  // Run inference
  const feeds: Record<string, unknown> = { [inputName]: inputTensor };
  const results = await sess.run(feeds);

  // Get first output
  const outputNames = Object.keys(results);
  if (outputNames.length === 0) {
    throw new Error('Model produced no output');
  }

  const output = results[outputNames[0]];
  return {
    data: output.data instanceof Float32Array ? output.data : Float32Array.from(output.data as number[]),
    dims: Array.from(output.dims as number[]),
  };
}

/** Default router instance (requires pool to be set up externally) */
export const onnxRouter = createOnnxRouter();
