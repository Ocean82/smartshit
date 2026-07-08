/**
 * smartsht Agent — "Kiro for spreadsheets"
 * 
 * Routes user messages through:
 * 1. Pattern parser (instant, no LLM) — handles 80%+ of requests
 * 2. Tool executor (instant) — mutates the spreadsheet
 * 3. LLM fallback — only for open-ended questions or complex reasoning
 * 
 * Every tool call is previewed before execution (Apply/Reject pattern).
 */

export { TOOL_REGISTRY, getToolDef, getToolNames, formatToolsForPrompt } from './tools'
export { parseMessage, type ParseResult, type ParsedToolCall } from './parser'
export { executeTool, type ExecutionContext, type ExecutionResult } from './executor'
