/**
 * In-process auth denial counters for ops visibility.
 *
 * There is no Prometheus stack yet — these surface on authenticated `/health`
 * and are rate-limited into the process log so scanners cannot flood disk.
 */

export type AuthDenialReason = 'no_bearer' | 'no_session'

export interface AuthMetricsSnapshot {
  denials: number
  byReason: Record<AuthDenialReason, number>
  lastDenialAt: string | null
  lastDenialPath: string | null
  lastDenialReason: AuthDenialReason | null
}

const byReason: Record<AuthDenialReason, number> = {
  no_bearer: 0,
  no_session: 0,
}

const metrics: AuthMetricsSnapshot = {
  denials: 0,
  byReason,
  lastDenialAt: null,
  lastDenialPath: null,
  lastDenialReason: null,
}

const LOG_INTERVAL_MS = 60_000
let lastLogAt = 0

/** Record a 401 from requireAuth. `no_session` with a Bearer token often means azp/JWT mismatch. */
export function recordAuthDenial(path: string, reason: AuthDenialReason): void {
  metrics.denials += 1
  metrics.byReason[reason] += 1
  metrics.lastDenialAt = new Date().toISOString()
  metrics.lastDenialPath = path
  metrics.lastDenialReason = reason

  const now = Date.now()
  if (now - lastLogAt < LOG_INTERVAL_MS) return
  lastLogAt = now
  console.warn(
    `[auth] 401 denials=${metrics.denials} last=${reason} path=${path} ` +
      `byReason=${JSON.stringify(metrics.byReason)}`,
  )
}

export function getAuthMetrics(): AuthMetricsSnapshot {
  return {
    denials: metrics.denials,
    byReason: { ...metrics.byReason },
    lastDenialAt: metrics.lastDenialAt,
    lastDenialPath: metrics.lastDenialPath,
    lastDenialReason: metrics.lastDenialReason,
  }
}

/** Test helper — resets counters and log throttle. */
export function resetAuthMetrics(): void {
  metrics.denials = 0
  metrics.byReason.no_bearer = 0
  metrics.byReason.no_session = 0
  metrics.lastDenialAt = null
  metrics.lastDenialPath = null
  metrics.lastDenialReason = null
  lastLogAt = 0
}
