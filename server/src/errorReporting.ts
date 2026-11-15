/**
 * Server error reporting — Sentry integration for production visibility.
 *
 * The client already reports through `src/lib/errorReporting.ts`; this is the
 * server-side counterpart so a 500 in the API is visible without watching logs.
 *
 * Behaviour:
 * - No `SENTRY_DSN` ⇒ completely inert (local dev, tests, self-hosted).
 * - Initialised once, at startup, before routes handle traffic.
 * - `captureError` tags events with the same short `errorId` the API returns to
 *   the client, so a user's "Something went wrong (abc12345)" maps to an event.
 *
 * PII: `sendDefaultPii` stays false. Callers pass only ids and paths; request
 * bodies and headers are deliberately never attached.
 */

import * as Sentry from '@sentry/node'

let initialized = false
let enabled = false

export interface ErrorReportingOptions {
  dsn?: string
  environment?: string
  release?: string
  /** 0 disables performance tracing (the default: errors only). */
  tracesSampleRate?: number
}

/** Env override that parses to a sane sample rate, or the fallback. */
function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
}

/**
 * Initialise Sentry. Returns whether reporting is active.
 * Safe to call more than once — later calls return the first result.
 */
export function initErrorReporting(options: ErrorReportingOptions = {}): boolean {
  if (initialized) return enabled
  initialized = true

  const dsn = (options.dsn ?? process.env.SENTRY_DSN ?? '').trim()
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment:
      options.environment ?? process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
    release: options.release ?? process.env.SENTRY_RELEASE,
    tracesSampleRate:
      options.tracesSampleRate ?? parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0),
  })

  enabled = true
  return true
}

export function isErrorReportingEnabled(): boolean {
  return enabled
}

/** Report a handled error. No-op when reporting is not configured. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  Sentry.withScope((scope) => {
    if (context) scope.setContext('smartsht', context)
    Sentry.captureException(error)
  })
}

/**
 * Flush queued events. Must be awaited before `process.exit`, otherwise the
 * event is dropped with the process. Returns false on timeout.
 */
export async function flushErrorReporting(timeoutMs = 2000): Promise<boolean> {
  if (!enabled) return true
  try {
    return await Sentry.flush(timeoutMs)
  } catch {
    return false
  }
}
