import { describe, expect, it, vi } from 'vitest'
import { probeProviders, formatProbeReport, type ProbeDeps } from './aiProbe.js'

function deps(overrides: Partial<ProbeDeps> = {}): ProbeDeps {
  return {
    providers: ['groq', 'openrouter', 'ollama'],
    call: vi.fn(async () => ({ text: 'OK' })),
    modelName: (p) => `${p}-model`,
    now: (() => { let t = 0; return () => (t += 100) })(),
    timeoutMs: 1000,
    ...overrides,
  }
}

describe('probeProviders', () => {
  it('makes one real call per cloud provider and skips local Ollama', async () => {
    const d = deps()
    const results = await probeProviders(d)
    expect(d.call).toHaveBeenCalledTimes(2)
    expect(results.map((r) => [r.provider, r.status])).toEqual([
      ['groq', 'ok'],
      ['openrouter', 'ok'],
      ['ollama', 'skipped'],
    ])
    expect(results[0].model).toBe('groq-model')
  })

  it('fails a provider that throws, and one that answers with an empty completion', async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new Error('404 model_not_found'))
      .mockResolvedValueOnce({ text: '   ' })
    const results = await probeProviders(deps({ call }))
    expect(results[0]).toMatchObject({ provider: 'groq', status: 'fail', detail: '404 model_not_found' })
    expect(results[1]).toMatchObject({ provider: 'openrouter', status: 'fail', detail: 'empty completion' })
  })

  it('passes an abort signal so a hung provider times out', async () => {
    const call = vi.fn((_p: string, signal: AbortSignal) => new Promise<{ text: string }>((_r, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const results = await probeProviders(deps({ providers: ['groq'], call, timeoutMs: 10 }))
    expect(results[0].status).toBe('fail')
  })
})

describe('formatProbeReport', () => {
  it('summarises results and reports failure when any cloud provider failed', () => {
    const report = formatProbeReport([
      { provider: 'groq', model: 'm', status: 'ok', latencyMs: 300 },
      { provider: 'openrouter', model: 'm', status: 'fail', latencyMs: 50, detail: '402 credits' },
      { provider: 'ollama', model: 'm', status: 'skipped', latencyMs: 0 },
    ])
    expect(report.healthy).toBe(false)
    expect(report.text).toContain('FAIL openrouter (m): 402 credits')
    expect(report.text).toContain('ok   groq (m) 300ms')
  })

  it('is unhealthy when no cloud provider was probed at all', () => {
    expect(formatProbeReport([{ provider: 'ollama', model: 'm', status: 'skipped', latencyMs: 0 }]).healthy).toBe(false)
  })
})
