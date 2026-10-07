/**
 * Zod schemas for the AI Function endpoint validation.
 */

import { z } from 'zod'
import { byokSchema } from './byok.js'

/** POST /api/ai-function request body. */
export const aiFunctionBodySchema = z.object({
  function: z.string().min(1, 'function name is required'),
  args: z.record(z.string(), z.unknown()),
  byok: byokSchema.optional(),
})

export type AIFunctionBody = z.infer<typeof aiFunctionBodySchema>

export const MAX_BATCH_INPUTS = 100

/** POST /api/ai-function/batch request body. */
export const aiFunctionBatchSchema = z.object({
  inputs: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        function: z.string().min(1).max(64),
        args: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1, 'inputs must be a non-empty array')
    .max(MAX_BATCH_INPUTS, `Maximum ${MAX_BATCH_INPUTS} inputs per batch request`),
  byok: byokSchema.optional(),
})

export type AIFunctionBatchBody = z.infer<typeof aiFunctionBatchSchema>
