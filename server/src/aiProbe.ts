/**
 * Synthetic AI check: one tiny real completion per configured cloud provider.
 *
 * `/health` only checks that keys are configured, so a retired model (404) or an
 * empty credit balance (402) stayed green while every chat failed. Run on the box
 * by `scripts/aiProbe.ts` (scheduled from `.github/workflows/ai-probe.yml`).
 * Ollama is skipped: on the production host it takes ~1 minute per reply.
 */

import type { ProviderName } from './providers.js'

export type ProbeStatus = 'ok' | 'fail' | 'skipped'

export interface ProbeResult {
  provider: ProviderName
  model: string
  status: ProbeStatus
  latencyMs: number
  detail?: string
}

export interface ProbeDeps {
  providers: ProviderName[]
  call: (provider: ProviderName, signal: AbortSignal) => Promise<{ text: string }>
  modelName: (provider: ProviderName) => string
  now: () => number
  timeoutMs: number
}

export async function probeProviders(deps: ProbeDeps): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []
  for (const provider of deps.providers) {
    const model = deps.modelName(provider)
    if (provider === 'ollama') {
      results.push({ provider, model, status: 'skipped', latencyMs: 0, detail: 'local model, too slow to probe' })
      continue
    }
    const start = deps.now()
    const signal = AbortSignal.timeout(deps.timeoutMs)
    try {
      const { text } = await deps.call(provider, signal)
      const latencyMs = Math.round(deps.now() - start)
      results.push(
        text.trim()
          ? { provider, model, status: 'ok', latencyMs }
          : { provider, model, status: 'fail', latencyMs, detail: 'empty completion' },
      )
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      results.push({ provider, model, status: 'fail', latencyMs: Math.round(deps.now() - start), detail: detail.slice(0, 300) })
    }
  }
  return results
}

/** Healthy only when every probed cloud provider answered and at least one was probed. */
export function formatProbeReport(results: ProbeResult[]): { healthy: boolean; text: string } {
  const probed = results.filter((r) => r.status !== 'skipped')
  const healthy = probed.length > 0 && probed.every((r) => r.status === 'ok')
  const lines = results.map((r) => {
    if (r.status === 'ok') return `ok   ${r.provider} (${r.model}) ${r.latencyMs}ms`
    if (r.status === 'skipped') return `skip ${r.provider} (${r.model}): ${r.detail ?? ''}`
    return `FAIL ${r.provider} (${r.model}): ${r.detail ?? 'unknown error'}`
  })
  return { healthy, text: lines.join('\n') }
}
