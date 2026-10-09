/**
 * Usage (from /opt/smartsht/current/server, same cwd as PM2 so the same .env loads):
 *   node dist/server/src/scripts/aiProbe.js
 * Prints one line per provider; exits 1 when any configured cloud provider fails.
 */

import { callProvider, getModelName, providerIsConfigured, providerOrder } from '../providers.js'
import { formatProbeReport, probeProviders } from '../aiProbe.js'

const PROBE_MESSAGES = [{ role: 'user' as const, content: 'Reply with exactly: OK' }]

const results = await probeProviders({
  providers: providerOrder().filter(providerIsConfigured),
  call: (provider, signal) => callProvider(provider, PROBE_MESSAGES, { maxTokens: 256, signal }),
  modelName: getModelName,
  now: () => performance.now(),
  timeoutMs: 30_000,
})

const report = formatProbeReport(results)
console.log(report.text)
process.exit(report.healthy ? 0 : 1)
