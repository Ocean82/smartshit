/**
 * Master prompt builder — assembles the full system prompt from modular components.
 *
 * Architecture (per docs/chat-prompt/chat.md):
 *   persona.ts           → Core identity & tone
 *   fewShot.ts           → Example conversations for style consistency
 *   clarification.ts     → When/how to ask clarifying questions
 *   auditContext.ts      → Audit findings injector
 *   spreadsheetContext.ts → Live spreadsheet state (minimal; full context in ../prompt.ts)
 *
 * The existing `../prompt.ts` remains the primary prompt builder for the chat
 * endpoints — it has richer context formatting and mode-specific logic.
 * This module provides the modular pieces that ../prompt.ts can import.
 */

export { PERSONA_PROMPT } from './persona.js'
export { FEW_SHOT_EXAMPLES, type FewShotExample } from './fewShot.js'
export { CLARIFICATION_RULES } from './clarification.js'
export { buildAuditContext, type AuditSummary, type AuditFindingSummary } from './auditContext.js'
export { buildMinimalSpreadsheetContext, type SpreadsheetSnapshot } from './spreadsheetContext.js'
