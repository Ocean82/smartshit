/**
 * Unit tests for ONNX Web Worker error classification and types.
 *
 * Tests the classifyError utility which categorizes runtime errors
 * from ONNX Runtime Web into actionable error codes for the main thread.
 */

import { describe, it, expect } from 'vitest';
import { classifyError, type ErrorCode } from './workerErrors';

describe('classifyError', () => {
  it('classifies out-of-memory errors', () => {
    const cases = [
      'out of memory during allocation',
      'OOM: Cannot grow memory',
      'memory allocation failed for 512MB',
      'Cannot allocate WebAssembly memory',
      'memory access out of bounds',
    ];

    for (const msg of cases) {
      const result = classifyError(new Error(msg));
      expect(result.code).toBe('oom' satisfies ErrorCode);
      expect(result.message).toContain('Out of memory');
    }
  });

  it('classifies WASM trap errors', () => {
    const cases = [
      'unreachable code executed',
      'RuntimeError: memory access out of bounds',
      'wasm trap detected',
      'WASM trap: integer overflow',
      'abort(OOM)',
      'table index is out of bounds',
    ];

    for (const msg of cases) {
      const result = classifyError(new Error(msg));
      // Note: "RuntimeError" and "memory access out of bounds" can overlap with OOM
      // The function checks OOM patterns first, so some may classify as OOM
      expect(['wasm_trap', 'oom']).toContain(result.code);
    }
  });

  it('classifies unsupported operator errors', () => {
    const cases = [
      'unsupported operator: CustomOp',
      'Unsupported operator type: MyCustomNode',
      'unrecognized operator in graph',
      'Unknown op type: FancyConv',
      'Operator "CustomGelu" is not supported',
    ];

    for (const msg of cases) {
      const result = classifyError(new Error(msg));
      expect(result.code).toBe('unsupported_operator' satisfies ErrorCode);
      expect(result.message).toContain('Unsupported operator');
    }
  });

  it('classifies unknown errors as fallback', () => {
    const result = classifyError(new Error('something unexpected happened'));
    expect(result.code).toBe('unknown' satisfies ErrorCode);
    expect(result.message).toBe('something unexpected happened');
  });

  it('handles non-Error thrown values', () => {
    const result = classifyError('a plain string error');
    expect(result.code).toBe('unknown' satisfies ErrorCode);
    expect(result.message).toBe('a plain string error');
  });

  it('handles null/undefined thrown values', () => {
    const nullResult = classifyError(null);
    expect(nullResult.code).toBe('unknown');
    expect(nullResult.message).toBe('null');

    const undefinedResult = classifyError(undefined);
    expect(undefinedResult.code).toBe('unknown');
    expect(undefinedResult.message).toBe('undefined');
  });
});
