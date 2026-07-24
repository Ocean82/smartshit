/**
 * Consistent 500 handling for route handlers.
 *
 * Routes previously echoed `err.message` straight to the client, which leaks
 * Postgres and AWS SDK internals (table names, bucket keys, connection
 * details). Log the detail server-side and return a generic message plus a
 * correlation id the user can quote in a support request.
 */

import { randomUUID } from 'node:crypto'
import type { Response } from 'express'

/**
 * Log an error with a fresh correlation id and send a generic 500 response.
 *
 * @param res     Express response
 * @param context Short label identifying the call site, e.g. 'workbooks.create'
 * @param err     The caught error
 */
export function sendServerError(res: Response, context: string, err: unknown): void {
  const errorId = randomUUID().slice(0, 8)
  const detail = err instanceof Error ? err.stack ?? err.message : String(err)
  console.error(`[${context}] (${errorId})`, detail)

  if (res.headersSent) return
  res.status(500).json({
    error: 'Something went wrong on our end. Please try again.',
    errorId,
  })
}
