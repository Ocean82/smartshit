/**
 * smartsht Agent — "Kiro for spreadsheets"
 *
 * Routes user messages through:
 * 1. Pattern parser (instant, no LLM) — handles common spreadsheet operations
 * 2. Tool executor (instant) — mutates the spreadsheet
 * 3. LLM fallback — for open-ended questions or complex reasoning
 *
 * Fast-path (parser) tool calls auto-apply with a single undo point.
 * LLM-generated actions go through the Apply/Reject preview flow.
 * Both paths execute through the same executor and shared tool registry.
 */

export { TOOL_REGISTRY, getToolDefinition, resolveToolName, formatToolsForPrompt } from './tools'
export { parseMessage, type ParseResult, type ParsedToolCall, type SheetContext } from './parser'
export { executeTool, type ExecutionContext, type ExecutionResult } from './executor'
