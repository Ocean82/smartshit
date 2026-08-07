/**
 * Unit tests for PipelineRouter.
 *
 * Validates: REQ-1 (single entry point, ordered stages, single winner),
 * REQ-2.3 (stages independently testable), REQ-11 (observability/timing).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPipelineRouter } from '../router'
import type { PipelineContext, PipelineStage, StageResult } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(message = 'test input'): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
  }
}

function makeStage(name: string, result: StageResult | null): PipelineStage {
  return {
    name,
    process: vi.fn().mockResolvedValue(result),
  }
}

function makeResult(stageName: string): StageResult {
  return { success: true, message: `Handled by ${stageName}`, stageName }
}

function makeThrowingStage(name: string, error: string): PipelineStage {
  return {
    name,
    process: vi.fn().mockRejectedValue(new Error(error)),
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PipelineRouter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the result from the first claiming stage', async () => {
    const stage1 = makeStage('stage-1', makeResult('stage-1'))
    const stage2 = makeStage('stage-2', makeResult('stage-2'))

    const router = createPipelineRouter([stage1, stage2])
    const result = await router.process(makeContext())

    expect(result.stageName).toBe('stage-1')
    expect(result.message).toBe('Handled by stage-1')
  })

  it('does not execute subsequent stages after one claims', async () => {
    const stage1 = makeStage('stage-1', makeResult('stage-1'))
    const stage2 = makeStage('stage-2', makeResult('stage-2'))

    const router = createPipelineRouter([stage1, stage2])
    await router.process(makeContext())

    expect(stage1.process).toHaveBeenCalledTimes(1)
    expect(stage2.process).not.toHaveBeenCalled()
  })

  it('passes to the next stage when one returns null', async () => {
    const stage1 = makeStage('stage-1', null)
    const stage2 = makeStage('stage-2', makeResult('stage-2'))

    const router = createPipelineRouter([stage1, stage2])
    const result = await router.process(makeContext())

    expect(stage1.process).toHaveBeenCalledTimes(1)
    expect(stage2.process).toHaveBeenCalledTimes(1)
    expect(result.stageName).toBe('stage-2')
  })

  it('catches stage errors and continues to the next stage', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stage1 = makeThrowingStage('broken-stage', 'kaboom')
    const stage2 = makeStage('healthy-stage', makeResult('healthy-stage'))

    const router = createPipelineRouter([stage1, stage2])
    const result = await router.process(makeContext())

    expect(result.stageName).toBe('healthy-stage')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"broken-stage" threw'),
      'kaboom',
    )
    consoleSpy.mockRestore()
  })

  it('returns a fallback result when no stage claims the input', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stage1 = makeStage('stage-1', null)
    const stage2 = makeStage('stage-2', null)

    const router = createPipelineRouter([stage1, stage2])
    const result = await router.process(makeContext())

    expect(result.success).toBe(false)
    expect(result.stageName).toBe('pipeline-fallback')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('records timing for each stage attempted', async () => {
    const stage1 = makeStage('stage-1', null)
    const stage2 = makeStage('stage-2', makeResult('stage-2'))
    const stage3 = makeStage('stage-3', makeResult('stage-3'))

    const router = createPipelineRouter([stage1, stage2, stage3])
    await router.process(makeContext())

    const timings = router.getLastTimings()
    expect(timings).toHaveLength(2) // stage-1 (pass) + stage-2 (claim); stage-3 not reached
    expect(timings[0].stageName).toBe('stage-1')
    expect(timings[0].claimed).toBe(false)
    expect(timings[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(timings[1].stageName).toBe('stage-2')
    expect(timings[1].claimed).toBe(true)
  })

  it('records timing for all stages when none claims', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stage1 = makeStage('a', null)
    const stage2 = makeStage('b', null)

    const router = createPipelineRouter([stage1, stage2])
    await router.process(makeContext())

    const timings = router.getLastTimings()
    expect(timings).toHaveLength(2)
    expect(timings.every((t) => !t.claimed)).toBe(true)
  })

  it('passes the same context object to all stages', async () => {
    const ctx = makeContext('shared context')
    const stage1: PipelineStage = {
      name: 'enricher',
      process: vi.fn(async (c: PipelineContext) => {
        // Enricher stage mutates context (like IntentClassifier)
        c.mode = 'act'
        return null
      }),
    }
    const stage2: PipelineStage = {
      name: 'consumer',
      process: vi.fn(async (c: PipelineContext) => {
        // Consumer stage reads enriched context
        return { success: true, message: `mode=${c.mode}`, stageName: 'consumer' }
      }),
    }

    const router = createPipelineRouter([stage1, stage2])
    const result = await router.process(ctx)

    expect(result.message).toBe('mode=act')
  })

  it('handles an empty stages array gracefully', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const router = createPipelineRouter([])
    const result = await router.process(makeContext())

    expect(result.success).toBe(false)
    expect(result.stageName).toBe('pipeline-fallback')
  })
})
