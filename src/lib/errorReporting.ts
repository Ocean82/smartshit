/**
 * Error Reporting — Sentry integration for production error visibility.
 *
 * Initializes Sentry with appropriate configuration for the SmartSht client.
 * Only active when VITE_SENTRY_DSN is set (production/staging environments).
 *
 * Usage:
 * - Call `initErrorReporting()` once in main.tsx before rendering
 * - Call `captureError(error, context)` from error boundaries and catch blocks
 * - Errors are tagged with user context (anonymous) and workbook metadata
 */

import * as Sentry from '@sentry/react'

let initialized = false

/**
 * Initialize Sentry error reporting.
 * No-op when VITE_SENTRY_DSN is not set (local dev).
 */
export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn || initialized) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // 'development' | 'production'
    release: `smartsht@${import.meta.env.VITE_APP_VERSION || '0.1.0'}`,

    // Performance: sample 10% of transactions in production
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session replay (captures user actions leading to errors)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,

    // Don't send PII — only anonymous context
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: false,
        response: false,
      },
      urlQueryParams: false,
      genAI: {
        inputs: false,
        outputs: false,
      },
    },

    // Filter noisy errors that aren't actionable
    beforeSend(event) {
      // Skip ResizeObserver loop errors (browser noise)
      if (event.exception?.values?.[0]?.value?.includes('ResizeObserver')) {
        return null
      }
      // Skip network errors from AI health checks (expected when offline)
      if (event.exception?.values?.[0]?.value?.includes('Failed to fetch') &&
          event.breadcrumbs?.some(b => b.data?.url?.includes('/health'))) {
        return null
      }
      return event
    },

    // Integrations
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  })

  initialized = true
}

/**
 * Capture an error with optional context.
 * Safe to call even if Sentry is not initialized (no-ops gracefully).
 */
export function captureError(
  error: Error,
  context?: {
    /** Which component/service threw */
    component?: string
    /** Additional metadata */
    extra?: Record<string, unknown>
  },
): void {
  if (!initialized) {
    // In dev, just log to console (already done by error boundaries)
    return
  }

  Sentry.withScope((scope) => {
    if (context?.component) {
      scope.setTag('component', context.component)
    }
    if (context?.extra) {
      scope.setExtras(context.extra)
    }
    Sentry.captureException(error)
  })
}

/**
 * Set user context for error reports (anonymous — just plan tier and workbook size).
 */
export function setErrorReportingUser(context: {
  plan?: 'free' | 'pro'
  sheetCount?: number
  cellCount?: number
}): void {
  if (!initialized) return

  Sentry.setContext('workbook', {
    plan: context.plan,
    sheetCount: context.sheetCount,
    cellCount: context.cellCount,
  })
}

/**
 * Add a breadcrumb for key user actions (aids debugging when errors occur later).
 */
export function addBreadcrumb(
  message: string,
  category: 'chat' | 'workbook' | 'import' | 'undo' | 'template' | 'navigation',
  data?: Record<string, unknown>,
): void {
  if (!initialized) return

  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    data,
  })
}

/** Re-export Sentry's ErrorBoundary for wrapping React trees */
export const SentryErrorBoundary = Sentry.ErrorBoundary
