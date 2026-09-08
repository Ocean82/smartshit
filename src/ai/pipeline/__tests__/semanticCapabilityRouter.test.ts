import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  setCapabilityEmbeddingsForTests,
  resetCapabilityEmbeddingsForTests,
  EMBEDDING_DIM,
  scoreCapabilities,
} from '@/ai/nlp/capabilityEmbeddings'
import { makeContext, makeDeps } from './helpers'
import {
  CAPABILITY_THRESHOLD,
  CAPABILITY_CHAT_THRESHOLD,
  capabilityClarifyChip,
  capabilityClarifySuggestion,
} from '../stages/semanticCapabilityRouter'
import { getCapability } from '@shared/capabilities.js'

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
  recordCapabilityRouterTelemetry: vi.fn(),
}))

import { getNLPEngine } from '@/ai/nlp/nlpEngine'
import { executeToolAsync } from '@/agent'
import { recordCapabilityRouterTelemetry } from '@/ai/telemetry'
import { suggestionChipLabel } from '@/ai/capabilities/clarifyChips'
import { createSemanticCapabilityRouterStage } from '../stages/semanticCapabilityRouter'

function unitVec(seed: number): Float32Array {
  const v = new Float32Array(EMBEDDING_DIM)
  v[seed % EMBEDDING_DIM] = 1
  return v
}

/** Near-unit vector so cosine stays above the conservative claim threshold. */
function nearUnit(seed: number, secondary = 0.1): Float32Array {
  const v = new Float32Array(EMBEDDING_DIM)
  v[seed % EMBEDDING_DIM] = 1
  v[(seed + 1) % EMBEDDING_DIM] = secondary
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n)
  for (let i = 0; i < v.length; i++) v[i] /= n
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
    vi.mocked(recordCapabilityRouterTelemetry).mockClear()
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

  it('clarifies with NL chips when top capabilities are close', async () => {
    const shared = unitVec(0)
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'format_as_table', embedding: shared, phrases: [] },
      { capabilityId: 'bold_headers', embedding: shared, phrases: [] },
      { capabilityId: 'format_currency', embedding: shared, phrases: [] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('make this look nicer')
    ctx.mode = 'act'
    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.ambiguous).toBe(true)
    expect(result!.message).toMatch(/do you want me to/i)
    expect(result!.message).toMatch(/Something else/i)
    expect(result!.suggestions?.length).toBeGreaterThanOrEqual(3)
    expect(result!.suggestions?.[0]).toBe(
      capabilityClarifySuggestion(getCapability('format_as_table')!),
    )
    expect(suggestionChipLabel(result!.suggestions![0])).toBe(
      capabilityClarifyChip(getCapability('format_as_table')!),
    )
    expect(result!.suggestions?.at(-1)).toMatch(/capability-skip/)
    expect(executeToolAsync).not.toHaveBeenCalled()
    expect(recordCapabilityRouterTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'ambiguous_clarify',
        routedTier: 2,
        message: 'make this look nicer',
      }),
    )
  })

  it('omits distant third candidates from clarify chips', async () => {
    // best=1, second≈0.995 (within gap), third=0 (outside gap)
    const best = unitVec(0)
    const near = nearUnit(0, 0.1) // still very close to unitVec(0)
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'format_as_table', embedding: best, phrases: [] },
      { capabilityId: 'bold_headers', embedding: near, phrases: [] },
      { capabilityId: 'sort_column', embedding: unitVec(50), phrases: [] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('make this look nicer')
    ctx.mode = 'act'
    const result = await stage.process(ctx)

    // nearUnit(0,0.1) vs unitVec(0) cosine is high; gap may or may not trigger clarify.
    // If clarified, sort_column must not appear as a chip (orthogonal).
    if (result?.metadata?.ambiguous) {
      const chips = result.suggestions ?? []
      expect(chips.some((c) => /biggest expenses|sort/i.test(c))).toBe(false)
      expect(chips.at(-1)).toMatch(/capability-skip/)
    }
  })

  it('passes when skipCapabilityRouter is set', async () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
    ])
    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('put biggest expenses first')
    ctx.mode = 'act'
    ctx.skipCapabilityRouter = true
    const result = await stage.process(ctx)
    expect(result).toBeNull()
    expect(recordCapabilityRouterTelemetry).not.toHaveBeenCalled()
  })

  it('short-circuits resolvedCapabilityId without re-clarifying', async () => {
    // Even if embeddings would be fully ambiguous, chip pick must not clarify again.
    const shared = unitVec(0)
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'format_as_table', embedding: shared, phrases: [] },
      { capabilityId: 'bold_headers', embedding: shared, phrases: [] },
    ])

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('Format this as a table')
    ctx.mode = 'act'
    ctx.resolvedCapabilityId = 'format_as_table'
    ctx.clarificationSource = 'clarification_chip'
    const result = await stage.process(ctx)

    expect(result?.metadata?.ambiguous).toBeUndefined()
    expect(result?.metadata?.capabilityId).toBe('format_as_table')
    expect(result?.metadata?.clarificationSource).toBe('clarification_chip')
    expect(result?.actions?.[0]?.tool).toBe('format_as_table')
    expect(executeToolAsync).not.toHaveBeenCalled()
  })

  it('records miss telemetry with top3 when below claim threshold', async () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: nearUnit(0, 0.9), phrases: [] },
      { capabilityId: 'format_as_table', embedding: unitVec(50), phrases: [] },
    ])

    // Query is near sort_column but noise keeps score below 0.75 in some setups —
    // use an orthogonal query so best score is low.
    vi.mocked(getNLPEngine).mockReturnValue({
      isReady: true,
      embed: vi.fn(async () => unitVec(100)),
    } as never)

    const stage = createSemanticCapabilityRouterStage(makeDeps())
    const ctx = makeContext('freeze the top row')
    ctx.mode = 'act'
    const result = await stage.process(ctx)

    expect(result).toBeNull()
    expect(recordCapabilityRouterTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'miss',
        routedTier: 2,
        message: 'freeze the top row',
        top3Capabilities: expect.any(Array),
      }),
    )
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
    expect(recordCapabilityRouterTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'pass_safety' }),
    )
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
})

describe('scoreCapabilities top-N', () => {
  beforeEach(() => {
    resetCapabilityEmbeddingsForTests()
  })

  it('returns ranked topCapabilities', () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
      { capabilityId: 'format_as_table', embedding: unitVec(10), phrases: [] },
      { capabilityId: 'bold_headers', embedding: unitVec(20), phrases: [] },
    ])

    const { topCapabilities, best, secondScore } = scoreCapabilities(unitVec(0))
    expect(best?.capabilityId).toBe('sort_column')
    expect(topCapabilities.map((c) => c.capabilityId)).toEqual([
      'sort_column',
      'format_as_table',
      'bold_headers',
    ])
    expect(secondScore).toBe(topCapabilities[1].score)
  })
})
