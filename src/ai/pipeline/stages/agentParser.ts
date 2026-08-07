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
import type { ExecutionContext } from '@/agent/executor'
import type { SheetContext, ParsedToolCall } from '@/agent/parser'
import { parseMessage, executeToolAsync } from '@/agent'
import { getToolDefinition } from '@shared/toolRegistry'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { cellToRef } from '@/engine/spreadsheet'
import { findDeleteRowMatches, resolveDeleteRow } from '@/lib/deleteRowPreview'
import { buildSpreadsheetContext } from '@/ai/buildContext'

export interface AgentParserDeps {
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  pushHistory: (desc: string) => void
}

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
        return executeToolCalls(parsed.calls, parsed.explanation, deps)
      }

      // Edge case: understood === true but no calls and no explanation
      return null
    },
  }
}

// ─── Delete Row Handler ─────────────────────────────────────────────────────

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

// ─── Tool Execution ─────────────────────────────────────────────────────────

async function executeToolCalls(
  calls: ParsedToolCall[],
  explanation: string | undefined,
  deps: AgentParserDeps,
): Promise<StageResult> {
  const hasMutation = calls.some((call) => {
    const category = getToolDefinition(call.tool)?.category
    return category === 'mutate' || category === 'template'
  })
  if (hasMutation) {
    deps.pushHistory(`AI: ${explanation || calls.map((c) => c.description).join(', ')}`)
  }

  const execCtx = deps.buildExecContext({ suppressHistory: true })

  // Execute sequentially to preserve mutation order
  const results = []
  for (const call of calls) {
    results.push(await executeToolAsync(call, execCtx))
  }

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
