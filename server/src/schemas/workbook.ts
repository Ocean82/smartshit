/**
 * Zod schemas for workbook create/save API bodies.
 */

import { z } from 'zod'

const MAX_NAME_LENGTH = 200
/** ~25MB JSON string — blocks pathological payloads before they hit S3. */
const MAX_DATA_BYTES = 25_000_000

/**
 * Workbook JSON payload as a string. Must parse to a non-array object
 * (garbage should fail at the API boundary, not at import time later).
 */
export const workbookDataJsonSchema = z
  .string({ error: 'data is required' })
  .min(1, 'data is required')
  .max(MAX_DATA_BYTES, 'data is too large')
  .superRefine((val, ctx) => {
    try {
      const parsed: unknown = JSON.parse(val)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        ctx.addIssue({ code: 'custom', message: 'data must be a JSON object' })
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: 'data must be valid JSON' })
    }
  })

export const createWorkbookBodySchema = z.object({
  name: z
    .string({ error: 'name is required' })
    .trim()
    .min(1, 'name is required')
    .max(MAX_NAME_LENGTH, `name must be at most ${MAX_NAME_LENGTH} characters`),
  data: workbookDataJsonSchema,
  sheetCount: z.number().int().min(1).max(200).optional(),
})

export const saveWorkbookBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_NAME_LENGTH, `name must be at most ${MAX_NAME_LENGTH} characters`)
    .optional(),
  data: workbookDataJsonSchema,
  sheetCount: z.number().int().min(1).max(200).optional(),
})

export type CreateWorkbookBody = z.infer<typeof createWorkbookBodySchema>
export type SaveWorkbookBody = z.infer<typeof saveWorkbookBodySchema>
