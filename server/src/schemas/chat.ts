/**
 * Zod schemas for chat-related API request validation.
 */

import { z } from 'zod'
import { byokSchema } from './byok.js'

/** A single message in the conversation history (client-sent; no system role). */
const historyMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
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
  focusData: z.string().max(20_000).optional(),
}).passthrough()

/**
 * Client's authoritative routing decision — OPTIONAL and UNTRUSTED.
 * `.strict()` whitelist: reject unknown keys so no extra field is smuggled.
 * Enum literals are the exact members of the shared unions (AgentMode[5],
 * IntentType[18], routingSource[3]) and are kept in sync by the enum-sync
 * guard in server/src/routing.test.ts (test 7).
 */
const clientRoutingSchema = z.object({
  mode: z.enum(['explain', 'advise', 'act', 'help', 'chat']),
  intentType: z.enum([
    'read', 'analyze', 'write', 'format', 'create_chart', 'create_formula',
    'summarize', 'filter', 'sort', 'clean', 'budget', 'report', 'compare',
    'find', 'calculate', 'export', 'chat', 'unknown',
  ]),
  routingSource: z.enum(['nlp', 'llm', 'regex']),
  confidence: z.number().min(0).max(1),
}).strict()

/** POST /api/chat/stream request body. */
export const chatStreamBodySchema = z.object({
  message: z.string().min(1, 'message is required').max(10_000, 'message too long'),
  history: z.array(historyMessageSchema).max(100).optional(),
  context: contextSchema.optional(),
  forceLlm: z.boolean().optional(),
  byok: byokSchema.nullable().optional(),
  clientRouting: clientRoutingSchema.optional(),
})

/** POST /api/chat (non-streaming) — same schema as streaming. */
export const chatBodySchema = chatStreamBodySchema

export type ChatStreamBody = z.infer<typeof chatStreamBodySchema>
