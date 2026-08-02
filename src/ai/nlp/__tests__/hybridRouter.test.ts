/**
 * Unit tests for the Hybrid Router
 *
 * Tests three-tier fallback chain (NLP → LLM → Regex),
 * routing metadata, fallback warnings, config validation,
 * and timeout behavior.
 */

import { describe, it, expect, vi } from 'vitest'
import { createHybridRouter } from '../hybridRouter'
import type { NLPEngineClient } from '../nlpEngineClient'
import type { ClassificationResult, WorkbookContext } from '../types'
import type { UserIntent } from '@shared/intentTypes'

// ─── Helpers ────────────────────────────────────────────────────────────────

const defaultCtx: WorkbookContext = {
  activeSheetId: 'sheet1',
  sheets: [
    {
      id: 'sheet1',
      name: 'Sheet 1',
      columns: [{ letter: 'A', headerName: 'Amount', index: 0 }],
    },
  ],
}

function makeNLPClient(overrides: Partial<NLPEngineClient> = {}): NLPEngineClient {
  return {
    state: 'ready',
    onStateChange: vi.fn(() => () => {}),
    classify: vi.fn(() =>
      Promise.resolve<ClassificationResult>({
        intentType: 'filter',
        confidence: 0.85,
        entities: [],
        isMultiStep: false,
      })
    ),
    planMacro: vi.fn(() => Promise.resolve({ steps: [], originalText: '', truncated: false })),
    dispose: vi.fn(),
    ...overrides,
  } as NLPEngineClient
}

function makeRegexParser(intent?: Partial<UserIntent>): (text: string) => UserIntent {
  return vi.fn((text: string) => ({
    intentType: 'filter' as const,
    targetColumns: [] as string[],
    filters: {} as Record<string, unknown>,
    parameters: {} as Record<string, unknown>,
    rawQuery: text,
    confidence: 0.4,
    ...intent,
  } satisfies UserIntent))
}

function makeLLMClassifier(intent?: Partial<UserIntent>): (text: string) => Promise<UserIntent> {
  return vi.fn((text: string) =>
    Promise.resolve({
      intentType: 'analyze' as const,
      targetColumns: [] as string[],
      filters: {} as Record<string, unknown>,
      parameters: {} as Record<string, unknown>,
      rawQuery: text,
      confidence: 0.9,
      ...intent,
    } satisfies UserIntent)
  )
}

const defaultConfig = {
  fallbackThreshold: 0.6,
  llmTimeoutMs: 5000,
  localTimeoutMs: 500,
}

// ─── Config Validation (Task 6.2) ──────────────────────────────────────────

describe('HybridRouter config validation', () => {
  it('accepts fallbackThreshold of 0.0', () => {
    expect(() =>
      createHybridRouter(
        makeNLPClient(),
        makeRegexParser(),
        makeLLMClassifier(),
        { ...defaultConfig, fallbackThreshold: 0.0 },
      )
    ).not.toThrow()
  })

  it('accepts fallbackThreshold of 1.0', () => {
    expect(() =>
      createHybridRouter(
        makeNLPClient(),
        makeRegexParser(),
        makeLLMClassifier(),
        { ...defaultConfig, fallbackThreshold: 1.0 },
      )
    ).not.toThrow()
  })

  it('accepts fallbackThreshold of 0.6 (default)', () => {
    expect(() =>
      createHybridRouter(
        makeNLPClient(),
        makeRegexParser(),
        makeLLMClassifier(),
        defaultConfig,
      )
    ).not.toThrow()
  })

  it('rejects fallbackThreshold below 0', () => {
    expect(() =>
      createHybridRouter(
        makeNLPClient(),
        makeRegexParser(),
        makeLLMClassifier(),
        { ...defaultConfig, fallbackThreshold: -0.1 },
      )
    ).toThrow(RangeError)
  })

  it('rejects fallbackThreshold above 1', () => {
    expect(() =>
      createHybridRouter(
        makeNLPClient(),
        makeRegexParser(),
        makeLLMClassifier(),
        { ...defaultConfig, fallbackThreshold: 1.1 },
      )
    ).toThrow(RangeError)
  })

  it('rejects NaN fallbackThreshold', () => {
    expect(() =>
      createHybridRouter(
        makeNLPClient(),
        makeRegexParser(),
        makeLLMClassifier(),
        { ...defaultConfig, fallbackThreshold: NaN },
      )
    ).toThrow(RangeError)
  })
})

// ─── Routing: NLP Path (Tier 1) ────────────────────────────────────────────

describe('HybridRouter NLP routing (Tier 1)', () => {
  it('routes to NLP when state is ready and confidence ≥ threshold', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'filter',
          confidence: 0.85,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('filter rows over 500', defaultCtx)

    expect(result.source).toBe('nlp')
    expect(result.confidence).toBe(0.85)
    expect(result.intent.routingSource).toBe('nlp')
    expect(result.intent.intentType).toBe('filter')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('routes to NLP when confidence equals threshold exactly', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'sort',
          confidence: 0.6,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('sort by date', defaultCtx)

    expect(result.source).toBe('nlp')
    expect(result.confidence).toBe(0.6)
  })

  it('includes latencyMs in routing result', async () => {
    const router = createHybridRouter(
      makeNLPClient(),
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('test', defaultCtx)
    expect(typeof result.latencyMs).toBe('number')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })
})

// ─── Routing: LLM Path (Tier 2) ────────────────────────────────────────────

describe('HybridRouter LLM routing (Tier 2)', () => {
  it('routes to LLM when NLP confidence < threshold', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'unknown',
          confidence: 0.3,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    const llmClassifier = makeLLMClassifier({
      intentType: 'analyze',
      confidence: 0.92,
    })

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      llmClassifier,
      defaultConfig,
    )

    const result = await router.route('what are the trends', defaultCtx)

    expect(result.source).toBe('llm')
    expect(result.confidence).toBe(0.92)
    expect(result.intent.routingSource).toBe('llm')
    expect(result.intent.intentType).toBe('analyze')
  })

  it('routes to LLM when NLP classification throws an error', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() => Promise.reject(new Error('worker crashed'))),
    } as unknown as Partial<NLPEngineClient>)

    const llmClassifier = makeLLMClassifier({ intentType: 'filter', confidence: 0.8 })

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      llmClassifier,
      defaultConfig,
    )

    const result = await router.route('filter data', defaultCtx)

    expect(result.source).toBe('llm')
    expect(result.intent.intentType).toBe('filter')
  })
})

// ─── Routing: Regex Fallback (Tier 3) ──────────────────────────────────────

describe('HybridRouter regex fallback (Tier 3)', () => {
  it('falls back to regex when NLP state is not ready', async () => {
    const nlpClient = makeNLPClient({
      state: 'loading',
    } as unknown as Partial<NLPEngineClient>)

    const regexParser = makeRegexParser({ intentType: 'sort', confidence: 0.5 })

    const router = createHybridRouter(
      nlpClient,
      regexParser,
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('sort data', defaultCtx)

    expect(result.source).toBe('regex')
    expect(result.intent.routingSource).toBe('regex')
    expect(result.intent.intentType).toBe('sort')
    // No fallback warning when NLP simply isn't ready (no LLM was attempted)
    expect(result.intent.parameters._fallbackWarning).toBeUndefined()
  })

  it('falls back to regex when NLP state is fallback', async () => {
    const nlpClient = makeNLPClient({
      state: 'fallback',
    } as unknown as Partial<NLPEngineClient>)

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('test', defaultCtx)
    expect(result.source).toBe('regex')
  })

  it('falls back to regex with warning when LLM times out', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'unknown',
          confidence: 0.2,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    // LLM never resolves (will timeout)
    const llmClassifier = vi.fn(
      () => new Promise<UserIntent>(() => {}) // never resolves
    )

    const regexParser = makeRegexParser({ intentType: 'filter', confidence: 0.35 })

    const router = createHybridRouter(
      nlpClient,
      regexParser,
      llmClassifier,
      { ...defaultConfig, llmTimeoutMs: 50 }, // short timeout for test
    )

    const result = await router.route('filter stuff', defaultCtx)

    expect(result.source).toBe('regex')
    expect(result.intent.routingSource).toBe('regex')
    expect(result.intent.parameters._fallbackWarning).toBe(
      'Result produced by fallback parser with reduced confidence'
    )
  })

  it('falls back to regex with warning when LLM rejects', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'unknown',
          confidence: 0.1,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    const llmClassifier = vi.fn(() => Promise.reject(new Error('connection refused')))

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      llmClassifier,
      defaultConfig,
    )

    const result = await router.route('do something', defaultCtx)

    expect(result.source).toBe('regex')
    expect(result.intent.parameters._fallbackWarning).toBe(
      'Result produced by fallback parser with reduced confidence'
    )
  })
})

// ─── Routing: NLP Timeout ───────────────────────────────────────────────────

describe('HybridRouter NLP timeout handling', () => {
  it('falls through to LLM when NLP exceeds localTimeoutMs', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(
        () => new Promise<ClassificationResult>(() => {}) // never resolves
      ),
    } as unknown as Partial<NLPEngineClient>)

    const llmClassifier = makeLLMClassifier({ intentType: 'sort', confidence: 0.88 })

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      llmClassifier,
      { ...defaultConfig, localTimeoutMs: 50 }, // short timeout for test
    )

    const result = await router.route('sort ascending', defaultCtx)

    expect(result.source).toBe('llm')
    expect(result.intent.intentType).toBe('sort')
  })
})

// ─── Routing Metadata ───────────────────────────────────────────────────────

describe('HybridRouter routing metadata', () => {
  it('always includes source in the result', async () => {
    const router = createHybridRouter(
      makeNLPClient(),
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('filter', defaultCtx)
    expect(['nlp', 'llm', 'regex']).toContain(result.source)
  })

  it('always includes confidence in the result', async () => {
    const router = createHybridRouter(
      makeNLPClient(),
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('filter', defaultCtx)
    expect(typeof result.confidence).toBe('number')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('sets routingSource on the intent object', async () => {
    const router = createHybridRouter(
      makeNLPClient(),
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('filter', defaultCtx)
    expect(result.intent.routingSource).toBe(result.source)
  })
})

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('HybridRouter edge cases', () => {
  it('handles empty text input without crashing', async () => {
    const router = createHybridRouter(
      makeNLPClient(),
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('', defaultCtx)
    expect(result).toBeDefined()
    expect(result.source).toBeDefined()
  })

  it('handles threshold of 0.0 (all NLP results accepted)', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'read',
          confidence: 0.01,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      makeLLMClassifier(),
      { ...defaultConfig, fallbackThreshold: 0.0 },
    )

    const result = await router.route('read data', defaultCtx)
    expect(result.source).toBe('nlp')
  })

  it('handles threshold of 1.0 (all NLP results rejected except confidence=1)', async () => {
    const nlpClient = makeNLPClient({
      state: 'ready',
      classify: vi.fn(() =>
        Promise.resolve<ClassificationResult>({
          intentType: 'filter',
          confidence: 0.99,
          entities: [],
          isMultiStep: false,
        })
      ),
    } as unknown as Partial<NLPEngineClient>)

    const llmClassifier = makeLLMClassifier({ intentType: 'filter', confidence: 0.95 })

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      llmClassifier,
      { ...defaultConfig, fallbackThreshold: 1.0 },
    )

    const result = await router.route('filter data', defaultCtx)
    // 0.99 < 1.0 threshold → should route to LLM
    expect(result.source).toBe('llm')
  })

  it('NLP state "updating" is treated as not ready', async () => {
    const nlpClient = makeNLPClient({
      state: 'updating',
    } as unknown as Partial<NLPEngineClient>)

    const router = createHybridRouter(
      nlpClient,
      makeRegexParser(),
      makeLLMClassifier(),
      defaultConfig,
    )

    const result = await router.route('test', defaultCtx)
    expect(result.source).toBe('regex')
  })
})
