/**
 * Express middleware factory for Zod request body validation.
 * Returns 400 with structured error details on validation failure.
 */

import type { Request, Response, NextFunction } from 'express'
import { type ZodType, type ZodError } from 'zod'

/**
 * Creates middleware that validates `req.body` against the given Zod schema.
 * On success, replaces `req.body` with the parsed (and coerced) value.
 * On failure, responds with 400 and a list of field-level errors.
 */
export function validateBody(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const zodError = result.error as ZodError
      const errors = zodError.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }))

      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      })
      return
    }

    // Replace body with parsed value (strips unknown fields where appropriate)
    req.body = result.data
    next()
  }
}
