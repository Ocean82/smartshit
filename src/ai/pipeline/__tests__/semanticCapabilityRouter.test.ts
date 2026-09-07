import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  setCapabilityEmbeddingsForTests,
  resetCapabilityEmbeddingsForTests,
  EMBEDDING_DIM,
} from '@/ai/nlp/capabilityEmbeddings'
import { makeContext, makeDeps } from './helpers'
import {
  CAPABILITY_THRESHOLD,
  CAPABILITY_CHAT_THRESHOLD,
} from '../stages/semanticCapabilityRouter'

vi.mock('@/ai/nlp/nlpEngine', () => ({
  getNLPEngine: vi.fn(),
}))

vi.mock('@/ai/buildContext', () => ({
  buildSpreadsheetContext: vi.fn(() => ({
    profile: {
      columns: [
        {
          name: 'Category',
          column: 'A',
          dtype: 'text',
          role: 'category',
          nonNullCount: 2,
          nullCount: 0,
          uniqueCount: 2,
          sampleValues: ['Food'],
        },
        {
          name: 'Amount',
          column: 'B',
          dtype: 'number',
          role: 'amount',
          nonNullCount: 2,
          nullCount: 0,
          uniqueCount: 2,
          sampleValues: [100],
        },
      ],
    },
    insights: null,
  })),
}))

vi.mock('@/agent', () => ({
  executeToolAsync: vi.fn(async (call: { description: string; tool: string }) => ({
    success: true,
    message: call.description,
    modified: call.tool === 'sort_sheet' ? 4 : 1,
  })),
}))

vi.mock('@/ai/telemetry', () => ({
  recordTelemetry: vi.fn(),
}))

import { getNLPEngine } from '@/ai/nlp/nlpEngine'
import { executeToolAsync } from '@/agent'
import { createSemanticCapabilityRouterStage } from '../stages/semanticCapabilityRouter'

function unitVec(seed: number): Float32Array {
  const v = new Float32Array(EMBEDDING_DIM)
  v[seed % EMBEDDING_DIM] = 1
  return v
}

describe('semanticCapabilityRouter', () => {
  beforeEach(() => {
    resetCapabilityEmbeddingsForTests()
    vi.mocked(getNLPEngine).mockReturnValue({
      isReady: true,
      embed: vi.fn(async () => unitVec(0)),
    } as never)
    vi.mocked(executeToolAsync).mockClear()
  })

  it('passes when capability embeddings are not bootstrapped', async () => {
    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('put biggest expenses first')
    ctx.mode = 'act'
    const result = await stage.process(ctx)
    expect(result).toBeNull()
  })

  it('claims sort_column via Apply preview without auto-executing', async () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: ['put biggest expenses first'] },
      { capabilityId: 'format_as_table', embedding: unitVec(50), phrases: ['format this as a table'] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('put the largest expenses first')
    ctx.mode = 'act'
    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('semantic-capability-router')
    expect(result!.metadata?.capabilityId).toBe('sort_column')
    expect(result!.metadata?.tier).toBe(2)
    expect(result!.metadata?.preview).toBe(true)
    expect((result!.metadata?.score as number)).toBeGreaterThanOrEqual(CAPABILITY_THRESHOLD)
    expect(result!.actions).toEqual([
      expect.objectContaining({
        tool: 'sort_sheet',
        params: expect.objectContaining({ column: 'B', direction: 'desc' }),
      }),
    ])
    expect(executeToolAsync).not.toHaveBeenCalled()
    expect(result!.message).toMatch(/Apply or Reject/i)
  })

  it('claims format_as_table with Apply preview in chat mode', async () => {
    vi.mocked(getNLPEngine).mockReturnValue({
      isReady: true,
      embed: vi.fn(async () => unitVec(50)),
    } as never)

    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
      { capabilityId: 'format_as_table', embedding: unitVec(50), phrases: ['format this as a table'] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('format this as a table')
    ctx.mode = 'chat'
    const result = await stage.process(ctx)

    expect(result?.metadata?.capabilityId).toBe('format_as_table')
    expect((result!.metadata?.score as number)).toBeGreaterThanOrEqual(CAPABILITY_CHAT_THRESHOLD)
    expect(result!.actions?.[0]?.tool).toBe('format_as_table')
    expect(executeToolAsync).not.toHaveBeenCalled()
  })

  it('passes question framings for destructive tools', async () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('should I put biggest expenses first?')
    ctx.mode = 'act'
    const result = await stage.process(ctx)

    expect(result).toBeNull()
    expect(executeToolAsync).not.toHaveBeenCalled()
  })

  it('passes compound multi-clause requests to macro planner', async () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('sort by amount and then format as currency')
    ctx.mode = 'act'
    const result = await stage.process(ctx)

    expect(result).toBeNull()
  })

  it('passes explain-mode messages to the LLM', async () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
    ])
    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('put biggest expenses first')
    ctx.mode = 'explain'
    const result = await stage.process(ctx)
    expect(result).toBeNull()
    expect(executeToolAsync).not.toHaveBeenCalled()
  })

  it('passes when scores are ambiguous', async () => {
    const shared = unitVec(0)
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: shared, phrases: [] },
      { capabilityId: 'format_as_table', embedding: shared, phrases: [] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('do something with the sheet')
    ctx.mode = 'act'
    const result = await stage.process(ctx)
    expect(result).toBeNull()
  })
})
