/**
 * Zod schemas for chat-related API request validation.
 */

import { z } from 'zod'

/** A single message in the conversation history. */
const historyMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
})

/** Column profile used in spreadsheet context. */
const columnProfileSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
}).passthrough()

/** Sheet profile metadata. */
const sheetProfileSchema = z.object({
  detectedPurpose: z.string().optional(),
  columns: z.array(columnProfileSchema).optional(),
}).passthrough()

/** Column statistics for insights. */
const columnStatSchema = z.object({
  sum: z.number().optional(),
  avg: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
}).passthrough()

/** Insights snapshot attached to the context. */
const insightsSchema = z.object({
  totalIncome: z.number().optional(),
  totalExpenses: z.number().optional(),
  columnStats: z.array(columnStatSchema).optional(),
}).passthrough()

/** Spreadsheet context attached to chat requests. */
const contextSchema = z.object({
  profile: sheetProfileSchema.optional(),
  insights: insightsSchema.optional(),
  sheetNames: z.array(z.string()).optional(),
  deterministicSummary: z.string().optional(),
}).passthrough()

/** BYOK (Bring Your Own Key) credentials. */
const byokSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().optional(),
  provider: z.string().optional(),
})

/** POST /api/chat/stream request body. */
export const chatStreamBodySchema = z.object({
  message: z.string().min(1, 'message is required').max(10_000, 'message too long'),
  history: z.array(historyMessageSchema).max(100).optional(),
  context: contextSchema.optional(),
  forceLlm: z.boolean().optional(),
  byok: byokSchema.optional(),
  sheetData: z.unknown().optional(),
})

/** POST /api/chat (non-streaming) — same schema as streaming. */
export const chatBodySchema = chatStreamBodySchema

export type ChatStreamBody = z.infer<typeof chatStreamBodySchema>
