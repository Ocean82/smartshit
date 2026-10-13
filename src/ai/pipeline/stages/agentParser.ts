/**
 * AgentParser Stage — Instant regex-based tool call extraction (no LLM).
 *
 * Wraps the existing src/agent/parser.ts parseMessage() function.
 * Handles 80%+ of common spreadsheet commands: sort, filter, add/delete row,
 * highlight, set cell, formulas, etc.
 *
 * Claims when: parseMessage returns understood === true
 * Passes when: parseMessage returns understood === false
 *
 * Includes the delete-row preview/confirm flow and compound mutation execution.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { ApplyPosture } from '@/types'
import type { ExecutionContext } from '@/agent/executor'
import type { SheetContext, ParsedToolCall } from '@/agent/parser'
import { parseMessage, executeTool } from '@/agent'
import { getToolDefinition } from '@shared/toolRegistry'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { cellToRef } from '@/engine/spreadsheet'
import { findDeleteRowMatches, resolveDeleteRow } from '@/lib/deleteRowPreview'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { shouldAutoApply } from '@/lib/applyPosture'

/** Store-backed collaborators the agent-parser stage needs to execute parsed tool calls. */
export interface AgentParserDeps {
  /** Build an {@link ExecutionContext} for running tools; `suppressHistory` defers the undo entry to the caller. */
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  /** Open a single undo group describing the parsed command before its tool calls run. */
  pushHistory: (desc: string) => void
}

/**
 * Tools that wipe or mass-modify data and should ALWAYS require Apply/Reject
 * confirmation before execution — even for single-step commands.
 */
const DESTRUCTIVE_TOOLS = new Set(['clear_sheet'])

/**
 * Create the regex agent-parser pipeline stage (no LLM).
 *
 * Runs `parseMessage` over the user's text; passes (`null`) when the command
 * isn't understood. Understood commands route to the delete-row or destructive
 * preview/confirm flows, or to {@link executeToolCalls}, which honors the apply
 * posture (auto-apply the low-risk allowlist, otherwise Apply/Reject).
 */
export function createAgentParserStage(deps: AgentParserDeps): PipelineStage {
  return {
    name: 'agent-parser',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const { message, sheet, getComputedValue, selection } = context

      // Build sheet context for the parser
      const headerRowIdx = findHeaderRow(sheet)
      const lastDataRowIdx = findLastDataRow(sheet)
      let lastDataColIdx = 0
      const headers: string[] = []
      for (const cellId of Object.keys(sheet.cells)) {
        lastDataColIdx = Math.max(lastDataColIdx, cellToRef(cellId).col)
      }
      for (let c = 0; c <= lastDataColIdx; c++) {
        headers.push(getComputedValue(headerRowIdx, c))
      }

      const spreadsheetCtx = buildSpreadsheetContext(
        context.workbook,
        sheet,
        selection,
        getComputedValue,
      )

      const sheetCtx: SheetContext = {
        headerRow: headerRowIdx,
        lastDataRow: lastDataRowIdx,
        lastDataCol: lastDataColIdx,
        headers,
        columns: spreadsheetCtx.profile?.columns,
      }

      const parsed = parseMessage(message, sheetCtx)

      // Not understood — pass to next stage
      if (!parsed.understood) return null

      // ─── Delete-row preview/confirm flow ────────────────────────────────
      if (parsed.calls.length === 1 && parsed.calls[0].tool === 'delete_row') {
        return handleDeleteRow(parsed.calls[0], context)
      }

      // ─── Destructive operation preview/confirm flow ─────────────────────
      // Operations that wipe significant data get the same Apply/Reject
      // treatment as delete_row to prevent accidental data loss.
      if (parsed.calls.length >= 1 && parsed.calls.some((c) => DESTRUCTIVE_TOOLS.has(c.tool))) {
        return handleDestructivePreview(parsed.calls, parsed.explanation)
      }

      // ─── Ambiguity clarification (understood but no calls) ──────────────
      if (parsed.calls.length === 0 && parsed.explanation) {
        return {
          success: true,
          message: parsed.explanation,
          stageName: 'agent-parser',
        }
      }

      // ─── Execute tool calls ─────────────────────────────────────────────
      if (parsed.calls.length > 0) {
        return executeToolCalls(parsed.calls, parsed.explanation, deps, context.applyPosture ?? 'preview')
      }

      // Edge case: understood === true but no calls and no explanation
      return null
    },
  }
}

// ─── Delete Row Handler ─────────────────────────────────────────────────────

/**
 * Resolve a parsed `delete_row` call to a confirmable preview.
 *
 * Returns a clarifying message when the match is ambiguous (multiple rows) or
 * unresolvable (no row found), and otherwise an Apply/Reject action carrying the
 * exact row number plus a signature so the row can't shift before Apply. Delete
 * always previews — it never auto-executes.
 */
function handleDeleteRow(
  call: ParsedToolCall,
  context: PipelineContext,
): StageResult {
  const { sheet, getComputedValue } = context
  const deleteParams = call.params

  // Check for ambiguous match (multiple rows)
  if (typeof deleteParams.match === 'string') {
    const matches = findDeleteRowMatches(sheet, deleteParams.match, getComputedValue)
    if (matches.length > 1) {
      return {
        success: true,
        message: `I found ${matches.length} rows containing **${deleteParams.match}** (rows ${matches.map((row: number) => row + 1).join(', ')}). Which exact row should I remove? Nothing was deleted.`,
        stageName: 'agent-parser',
      }
    }
  }

  // Resolve to an exact row
  const resolved = resolveDeleteRow(sheet, deleteParams, getComputedValue)
  if (!resolved) {
    return {
      success: true,
      message: "I couldn't find the row you asked to remove. Nothing was deleted.",
      stageName: 'agent-parser',
    }
  }

  // Return preview with actions for Apply/Reject UI
  return {
    success: true,
    message: `I found row ${resolved.rowNumber}: **${resolved.summary}**. Nothing has been deleted yet—review it, then choose Apply or Reject.`,
    actions: [{
      tool: 'delete_row',
      params: { row: resolved.rowNumber, expectedRowSignature: resolved.signature },
      description: `Delete row ${resolved.rowNumber}: ${resolved.summary}`,
    }],
    stageName: 'agent-parser',
    metadata: { toolUsed: 'delete-row-preview' },
  }
}

// ─── Destructive Operation Preview ──────────────────────────────────────────

/**
 * Returns a preview/confirm result for destructive tools.
 * The user sees what will happen and must click Apply to proceed.
 */
function handleDestructivePreview(
  calls: ParsedToolCall[],
  explanation: string | undefined,
): StageResult {
  const actions = calls.map((call) => ({
    tool: call.tool,
    params: call.params,
    description: call.description,
  }))

  const descriptions = calls.map((c) => c.description).join(', then ')
  const message = calls.length === 1
    ? `⚠️ **${calls[0].description}** — this will remove all data on this sheet. Review, then choose Apply or Reject.`
    : `⚠️ This will: ${descriptions}. Review, then choose Apply or Reject.`

  return {
    success: true,
    message: explanation ? `${explanation}\n\n${message}` : message,
    actions,
    stageName: 'agent-parser',
    metadata: { toolUsed: 'destructive-preview' },
  }
}

// ─── Tool Execution ─────────────────────────────────────────────────────────

/**
 * Execute (or preview) the parsed tool calls under the current apply posture.
 *
 * Read-only calls always run inline. Mutating calls auto-apply as one undo group
 * only when every call is on the low-risk allowlist (`shouldAutoApply`);
 * otherwise the whole batch is returned as Apply/Reject actions so the user
 * confirms before anything changes.
 */
async function executeToolCalls(
  calls: ParsedToolCall[],
  explanation: string | undefined,
  deps: AgentParserDeps,
  posture: ApplyPosture,
): Promise<StageResult> {
  const hasMutation = calls.some((call) => {
    const category = getToolDefinition(call.tool)?.category
    return category === 'mutate' || category === 'template'
  })

  // Posture gate (mutations only — read-only calls always run inline): auto-apply
  // only when every parsed call is on the low-risk allowlist. Otherwise return
  // Apply/Reject actions (same shape the destructive preview returns) so the
  // user confirms before anything changes.
  const everyCallAutoApplies = calls.every((c) => shouldAutoApply(c.tool, posture))
  if (hasMutation && !everyCallAutoApplies) {
    const base = explanation ?? calls.map((c) => c.description).join(', then ')
    return {
      success: true,
      message: `${base}\n\nReview, then choose Apply or Reject.`,
      actions: calls.map((c) => ({ tool: c.tool, params: c.params, description: c.description })),
      stageName: 'agent-parser',
      metadata: { toolUsed: 'preview' },
    }
  }

  if (hasMutation) {
    deps.pushHistory(`AI: ${explanation || calls.map((c) => c.description).join(', ')}`)
  }

  const execCtx = deps.buildExecContext({ suppressHistory: true })

  // Synchronous on purpose: pushHistory finalizes its undo diff in a microtask,
  // so an await between steps would leave later steps out of the undo entry.
  const results = calls.map((call) => executeTool(call, execCtx))

  const allSuccess = results.every((r) => r.success)
  const totalModified = results.reduce((sum, r) => sum + r.modified, 0)
  const resultMessages = results.map((r) => r.message)

  const allReadOnly = calls.every((call) => getToolDefinition(call.tool)?.category === 'read')
  const displayExplanation = allReadOnly
    ? resultMessages.join('. ')
    : (explanation || resultMessages.join('. '))

  const message = allSuccess
    ? `✓ ${displayExplanation}${totalModified > 0 ? ` (${totalModified} cell${totalModified === 1 ? '' : 's'} modified)` : ''}`
    : `⚠️ ${resultMessages.join('. ')}`

  return {
    success: allSuccess,
    message,
    stageName: 'agent-parser',
    metadata: {
      toolUsed: calls.map((c) => c.tool).join(', '),
      modified: totalModified,
    },
  }
}
