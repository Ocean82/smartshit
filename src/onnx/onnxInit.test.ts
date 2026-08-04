/**
 * Tests for ONNX.RUN registration wiring into the AIFunctionRegistry.
 *
 * Validates:
 * - ONNX.RUN is registered during SpreadsheetEngine initialization
 * - ONNX.RUN is available in the formula engine alongside existing AI functions
 * - ONNX.RUN is re-registered after engine reset
 * - Cleanup/unregister on destroy
 * - isAIFormula recognizes ONNX.RUN formulas
 *
 * Requirements: 11.1, 6.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIFunctionRegistry } from '@/engine/aiFunctions';
import { initializeOnnxFunction, type OnnxInitOptions } from './onnxInit';
import { SpreadsheetEngine } from '@/engine/spreadsheet';

// Mock the Worker constructor since we're in a Node test environment
vi.mock('./worker/workerBridge', () => {
  return {
    OnnxWorkerBridge: class MockOnnxWorkerBridge {
      terminate() {}
      loadModel() { return Promise.resolve({ sizeBytes: 0 }); }
      runInference() { return Promise.resolve({ data: new Float32Array([0]), dims: [1], dtype: 'float32' as const }); }
      getQueueDepth() { return 0; }
    },
  };
});

// Mock the SSE client adapter
vi.mock('./sseClientAdapter', () => {
  return {
    runServerInference: vi.fn().mockResolvedValue({
      outputTensor: { data: new Float32Array([0]), dims: [1], dtype: 'float32' },
      executionTimeMs: 100,
      path: 'server',
    }),
  };
});

describe('initializeOnnxFunction', () => {
  let registry: AIFunctionRegistry;
  let dispose: () => void;

  beforeEach(() => {
    registry = new AIFunctionRegistry();
  });

  afterEach(() => {
    if (dispose) {
      dispose();
    }
  });

  it('registers ONNX.RUN in the AIFunctionRegistry', () => {
    dispose = initializeOnnxFunction(registry);

    expect(registry.has('ONNX.RUN')).toBe(true);
  });

  it('ONNX.RUN has correct function info', () => {
    dispose = initializeOnnxFunction(registry);

    const info = registry.getFunctionInfo('ONNX.RUN');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('ONNX.RUN');
    expect(info!.category).toBe('AI/Analysis');
    expect(info!.isAsync).toBe(true);
    expect(info!.parameters).toHaveLength(2);
    expect(info!.parameters[0].name).toBe('model_name');
    expect(info!.parameters[1].name).toBe('input_range');
  });

  it('ONNX.RUN is included in getAllFunctions list', () => {
    dispose = initializeOnnxFunction(registry);

    const allFunctions = registry.getAllFunctions();
    const onnxFn = allFunctions.find(fn => fn.name === 'ONNX.RUN');
    expect(onnxFn).toBeDefined();
    expect(onnxFn!.description).toContain('ONNX model inference');
  });

  it('unregisters ONNX.RUN when dispose is called', () => {
    dispose = initializeOnnxFunction(registry);
    expect(registry.has('ONNX.RUN')).toBe(true);

    dispose();
    expect(registry.has('ONNX.RUN')).toBe(false);

    // Prevent double-dispose in afterEach
    dispose = () => {};
  });

  it('coexists with other registered AI functions', () => {
    // Register a mock AI function first
    registry.registerAsyncFunction(
      {
        name: 'AI.CATEGORIZE',
        description: 'Categorizes text',
        abstract: 'text categorization',
        category: 'AI/Text',
        syntax: 'AI.CATEGORIZE(text)',
        parameters: [{ name: 'text', description: 'Input text', required: true, type: 'string' }],
        isAsync: true,
      },
      async () => 'test',
    );

    dispose = initializeOnnxFunction(registry);

    // Both should exist
    expect(registry.has('AI.CATEGORIZE')).toBe(true);
    expect(registry.has('ONNX.RUN')).toBe(true);
  });

  it('accepts custom OnnxInitOptions', () => {
    const customOptions: OnnxInitOptions = {
      isServerReachable: () => false,
      isBrowserMemoryPressured: () => false,
    };

    dispose = initializeOnnxFunction(registry, customOptions);
    expect(registry.has('ONNX.RUN')).toBe(true);
  });
});

describe('SpreadsheetEngine ONNX.RUN integration', () => {
  let engine: SpreadsheetEngine;

  afterEach(() => {
    if (engine) {
      engine.destroy();
    }
  });

  it('registers ONNX.RUN during engine construction', () => {
    engine = new SpreadsheetEngine();

    expect(engine.aiRegistry.has('ONNX.RUN')).toBe(true);
  });

  it('ONNX.RUN survives engine reset', () => {
    engine = new SpreadsheetEngine();
    expect(engine.aiRegistry.has('ONNX.RUN')).toBe(true);

    engine.reset();
    expect(engine.aiRegistry.has('ONNX.RUN')).toBe(true);
  });

  it('ONNX.RUN is removed on engine destroy', () => {
    engine = new SpreadsheetEngine();
    const registry = engine.aiRegistry;
    expect(registry.has('ONNX.RUN')).toBe(true);

    engine.destroy();
    expect(registry.has('ONNX.RUN')).toBe(false);

    // Prevent double-destroy in afterEach
    engine = undefined as unknown as SpreadsheetEngine;
  });

  it('ONNX.RUN appears in getFunctionList', () => {
    engine = new SpreadsheetEngine();

    const list = engine.getFunctionList();
    const onnxFn = list.find(fn => fn.name === 'ONNX.RUN');
    expect(onnxFn).toBeDefined();
    expect(onnxFn!.category).toBe('AI/Analysis');
  });

  it('ONNX.RUN appears in getFunctionInfo', () => {
    engine = new SpreadsheetEngine();

    const info = engine.getFunctionInfo('ONNX.RUN');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('ONNX.RUN');
  });

  it('isAIFormula recognizes ONNX.RUN formulas', () => {
    engine = new SpreadsheetEngine();

    expect(engine.isAIFormula('=ONNX.RUN("model", A1:A10)')).toBe(true);
    expect(engine.isAIFormula('=onnx.run("model", A1:A10)')).toBe(true);
  });

  it('isAIFormula still recognizes AI.* formulas', () => {
    engine = new SpreadsheetEngine();

    expect(engine.isAIFormula('=AI.CATEGORIZE(A1)')).toBe(true);
    expect(engine.isAIFormula('=AI.SENTIMENT(B2)')).toBe(true);
  });

  it('isAIFormula rejects non-AI/ONNX formulas', () => {
    engine = new SpreadsheetEngine();

    expect(engine.isAIFormula('=SUM(A1:A10)')).toBe(false);
    expect(engine.isAIFormula('=VLOOKUP(A1, B:C, 2)')).toBe(false);
  });

  it('each engine instance has isolated ONNX.RUN registration', () => {
    const engine1 = new SpreadsheetEngine();
    const engine2 = new SpreadsheetEngine();

    expect(engine1.aiRegistry.has('ONNX.RUN')).toBe(true);
    expect(engine2.aiRegistry.has('ONNX.RUN')).toBe(true);

    engine1.destroy();
    // Engine 2 should still have ONNX.RUN
    expect(engine2.aiRegistry.has('ONNX.RUN')).toBe(true);

    engine2.destroy();
    engine = undefined as unknown as SpreadsheetEngine;
  });
});
