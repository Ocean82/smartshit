/**
 * Zod schemas for the AI Function endpoint validation.
 */

import { z } from 'zod'

/** BYOK credentials for AI function calls. */
const byokSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().optional(),
  provider: z.string().optional(),
})

/** POST /api/ai-function request body. */
export const aiFunctionBodySchema = z.object({
  function: z.string().min(1, 'function name is required'),
  args: z.record(z.string(), z.unknown()),
  byok: byokSchema.optional(),
})

export type AIFunctionBody = z.infer<typeof aiFunctionBodySchema>
