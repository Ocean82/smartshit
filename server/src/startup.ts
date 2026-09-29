import { validateConfig } from './config.js'
import { startReconciler } from './subscriptions.js'

/**
 * Boot background services: health-check critical config, then start the
 * subscription reconciler.
 *
 * Kept behind a tiny function (instead of inline in index.ts) so the boot
 * sequence is unit-testable without loading the whole HTTP server — importing
 * index.ts binds a port and boots every route.
 */
export function startBackgroundServices(): void {
  validateConfig()
  startReconciler()
}