/**
 * ONNX Worker Error Classification and Message Types
 *
 * Extracted from the worker entry point so that error classification logic
 * can be unit-tested in a Node environment without Web Worker globals.
 *
 * Requirements: 2.4, 1.6
 */

// --- Message Types ---

export type WorkerMessage =
  | { type: 'load'; modelBinary: ArrayBuffer; modelHash: string }
  | { type: 'infer'; sessionHash: string; inputData: ArrayBuffer; inputDims: number[] }
  | { type: 'healthcheck' }
  | { type: 'terminate' };

export type WorkerResponse =
  | { type: 'loaded'; sessionHash: string; sizeBytes: number }
  | { type: 'result'; outputData: ArrayBuffer; outputDims: number[] }
  | { type: 'error'; code: string; message: string }
  | { type: 'healthcheck_ack' };

export type ErrorCode = 'oom' | 'wasm_trap' | 'unsupported_operator' | 'unknown';

// --- Error Classification ---

/**
 * Classifies an error into one of the known error codes based on its message content.
 *
 * Priority order:
 * 1. Out-of-memory (OOM) — catches memory allocation failures and bounds violations
 * 2. WASM traps — catches unreachable code, runtime errors, aborts
 * 3. Unsupported operators — catches model compatibility issues
 * 4. Unknown — fallback for any unrecognized error
 */
export function classifyError(error: unknown): { code: ErrorCode; message: string } {
  const msg = error instanceof Error ? error.message : String(error);

  if (
    msg.includes('out of memory') ||
    msg.includes('OOM') ||
    msg.includes('memory allocation failed') ||
    msg.includes('Cannot allocate') ||
    msg.includes('memory access out of bounds')
  ) {
    return { code: 'oom', message: `Out of memory: ${msg}` };
  }

  if (
    msg.includes('unreachable') ||
    msg.includes('RuntimeError') ||
    msg.includes('wasm trap') ||
    msg.includes('WASM trap') ||
    msg.includes('abort(') ||
    msg.includes('table index is out of bounds')
  ) {
    return { code: 'wasm_trap', message: `WASM trap: ${msg}` };
  }

  if (
    msg.includes('unsupported operator') ||
    msg.includes('Unsupported operator') ||
    msg.includes('unrecognized operator') ||
    msg.includes('Unknown op type') ||
    msg.includes('is not supported')
  ) {
    return { code: 'unsupported_operator', message: `Unsupported operator: ${msg}` };
  }

  return { code: 'unknown', message: msg };
}
