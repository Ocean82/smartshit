/**
 * NLP engine graceful-degradation tests.
 *
 * Self-hosted deployments that skip `npm run model:copy-deploy` serve a 404 for
 * the MiniLM model assets, so the worker init rejects and the engine drops to
 * its keyword-classifier fallback. This must never throw or block chat — the
 * model is an enhancement, not a hard dependency. These tests pin that contract
 * at the level the pipeline actually depends on: NLPEngine.classify().
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { NLPEngine } from './nlpEngine'
import type { NLPEngineState } from './types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NLPEngine graceful degradation (missing model / 404)', () => {
  it('classifies via the keyword fallback when the engine never became ready', async () => {
    // No startInit() → isReady is false, exactly the state after an init failure.
    const engine = new NLPEngine()

    const result = await engine.classify('sum column B')

    // Real keyword classification happened — not a thrown error, not undefined.
    expect(result).toBeTruthy()
    expect(typeof result.intentType).toBe('string')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.entities)).toBe(true)
  })

  it('never throws on classify() regardless of engine readiness', async () => {
    const engine = new NLPEngine()
    await expect(engine.classify('add a new column')).resolves.toBeTruthy()
    await expect(engine.classify('')).resolves.toBeTruthy()
  })

  it('reports a non-ready state and no crash before init', () => {
    const engine = new NLPEngine()
    expect(engine.isReady).toBe(false)
    // 'loading' is the pre-init state; the important part is it does not throw.
    expect(['loading', 'fallback'] as NLPEngineState[]).toContain(engine.state)
    expect(engine.status.initialized).toBe(false)
  })

  it('embed() returns null (not a throw) when the engine is unavailable', async () => {
    const engine = new NLPEngine()
    await expect(engine.embed('anything')).resolves.toBeNull()
  })
})
