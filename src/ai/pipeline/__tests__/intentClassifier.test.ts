/**
 * Unit tests for IntentClassifier stage.
 *
 * Enrich-only by default; claims on mutate↔analyze conflict when NLP is ready.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

vi.mock('@shared/intentParser', () => ({
  parseUserIntent: vi.fn(),
}))

vi.mock('@shared/mode', () => ({
  classifyMode: vi.fn(),
}))

vi.mock('@/ai/nlp/nlpEngine', () => ({
  getNLPEngine: vi.fn(),
}))

vi.mock('@/ai/nlp/intentEmbeddings', () => ({
  isBootstrapped: vi.fn(),
}))

import { parseUserIntent } from '@shared/intentParser'
import { classifyMode } from '@shared/mode'
import { getNLPEngine } from '@/ai/nlp/nlpEngine'
import { isBootstrapped } from '@/ai/nlp/intentEmbeddings'
import {
  createIntentClassifierStage,
  isCrossBucketIntentConflict,
} from '../stages/intentClassifier'
import { parseModePickMessage } from '@/ai/capabilities/clarifyChips'

function makeContext(message = 'analyze my expenses'): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
  }
}

function mockRegexIntent(overrides: Record<string, unknown> = {}) {
  vi.mocked(parseUserIntent).mockReturnValue({
    intentType: 'analyze',
    targetColumns: [],
    filters: {},
    parameters: {},
    rawQuery: 'analyze my expenses',
    confidence: 0.85,
    routingSource: 'regex',
    ...overrides,
  } as ReturnType<typeof parseUserIntent>)
}

describe('isCrossBucketIntentConflict', () => {
  it('detects mutate vs analyze disagreement', () => {
    expect(isCrossBucketIntentConflict('sort', 'analyze')).toBe(true)
    expect(isCrossBucketIntentConflict('analyze', 'sort')).toBe(true)
  })

  it('ignores same-bucket or unknown', () => {
    expect(isCrossBucketIntentConflict('sort', 'filter')).toBe(false)
    expect(isCrossBucketIntentConflict('analyze', 'report')).toBe(false)
    expect(isCrossBucketIntentConflict('sort', 'unknown')).toBe(false)
  })
})

describe('IntentClassifier stage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(isBootstrapped).mockReturnValue(false)
    vi.mocked(getNLPEngine).mockReturnValue({
      isReady: false,
      classify: vi.fn(),
    } as never)
  })

  it('returns null when NLP is unavailable (enrich only)', async () => {
    mockRegexIntent()
    vi.mocked(classifyMode).mockReturnValue('act')

    const stage = createIntentClassifierStage()
    const result = await stage.process(makeContext())

    expect(result).toBeNull()
  })

  it('enriches context with parsed intent', async () => {
    const mockIntent = {
      intentType: 'report',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'generate a report',
      confidence: 0.9,
      routingSource: 'regex',
    } as ReturnType<typeof parseUserIntent>

    vi.mocked(parseUserIntent).mockReturnValue(mockIntent)
    vi.mocked(classifyMode).mockReturnValue('act')

    const ctx = makeContext('generate a report')
    await createIntentClassifierStage().process(ctx)

    expect(ctx.intent).toBe(mockIntent)
  })

  it('enriches context with classified mode', async () => {
    mockRegexIntent({ intentType: 'chat', rawQuery: 'explain my data', confidence: 0.5 })
    vi.mocked(classifyMode).mockReturnValue('explain')

    const ctx = makeContext('explain my data')
    await createIntentClassifierStage().process(ctx)

    expect(ctx.mode).toBe('explain')
  })

  it('respects resolvedMode over classifyMode', async () => {
    mockRegexIntent({ intentType: 'sort', confidence: 0.8 })
    vi.mocked(classifyMode).mockReturnValue('chat')

    const ctx = makeContext('sort by amount')
    ctx.resolvedMode = 'act'
    await createIntentClassifierStage().process(ctx)

    expect(ctx.mode).toBe('act')
  })

  it('claims with mode-pick chips on cross-bucket regex/NLP conflict', async () => {
    mockRegexIntent({ intentType: 'sort', confidence: 0.8, rawQuery: 'sort my spending' })
    vi.mocked(classifyMode).mockReturnValue('act')
    vi.mocked(isBootstrapped).mockReturnValue(true)
    vi.mocked(getNLPEngine).mockReturnValue({
      isReady: true,
      classify: vi.fn().mockResolvedValue({
        intentType: 'analyze',
        confidence: 0.82,
        entities: [],
      }),
    } as never)

    const result = await createIntentClassifierStage().process(makeContext('sort my spending'))

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('intent-classifier')
    expect(result!.metadata?.intentConflict).toBe(true)
    expect(result!.suggestions).toHaveLength(2)
    expect(parseModePickMessage(result!.suggestions![0])).toEqual({
      mode: 'act',
      original: 'sort my spending',
    })
    expect(parseModePickMessage(result!.suggestions![1])).toEqual({
      mode: 'explain',
      original: 'sort my spending',
    })
  })

  it('does not re-clarify when resolvedMode is set on a conflict utterance', async () => {
    mockRegexIntent({ intentType: 'sort', confidence: 0.8 })
    vi.mocked(classifyMode).mockReturnValue('act')
    vi.mocked(isBootstrapped).mockReturnValue(true)
    vi.mocked(getNLPEngine).mockReturnValue({
      isReady: true,
      classify: vi.fn().mockResolvedValue({
        intentType: 'analyze',
        confidence: 0.82,
        entities: [],
      }),
    } as never)

    const ctx = makeContext('sort my spending')
    ctx.resolvedMode = 'act'
    const result = await createIntentClassifierStage().process(ctx)

    expect(result).toBeNull()
    expect(ctx.mode).toBe('act')
  })

  it('has the correct stage name', () => {
    expect(createIntentClassifierStage().name).toBe('intent-classifier')
  })

  it('calls parseUserIntent with the message from context', async () => {
    mockRegexIntent({ intentType: 'clean', rawQuery: 'clean my data', confidence: 0.8 })
    vi.mocked(classifyMode).mockReturnValue('act')

    await createIntentClassifierStage().process(makeContext('clean my data'))

    expect(parseUserIntent).toHaveBeenCalledWith('clean my data')
    expect(classifyMode).toHaveBeenCalledWith('clean my data')
  })
})
