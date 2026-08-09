/**
 * MacroPlanner Stage — multi-clause command decomposition.
 *
 * Sits between IntentClassifier and DeterministicDispatcher.
 * When a message has 2+ clauses that each parse into tool calls,
 * presents a single pending `execute_macro` action (Apply = confirm).
 * Otherwise passes through (returns null).
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { SheetContext, ParsedToolCall } from '@/agent/parser'
import { parseMessage } from '@/agent'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { cellToRef } from '@/engine/spreadsheet'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { segmentClauses } from '@/ai/nlp/macroPlanner'
import type { ActionStep } from '@/ai/nlp/types'

function buildSheetContext(context: PipelineContext): SheetContext {
  const { sheet, getComputedValue } = context
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
    context.selection,
    getComputedValue,
  )

  return {
    headerRow: headerRowIdx,
    lastDataRow: lastDataRowIdx,
    lastDataCol: lastDataColIdx,
    headers,
    columns: spreadsheetCtx.profile?.columns,
  }
}

function callsToSteps(calls: ParsedToolCall[]): ActionStep[] {
  return calls.map((call) => ({
    tool: call.tool,
    params: call.params,
    description: call.description,
  }))
}

export function createMacroPlannerStage(): PipelineStage {
  return {
    name: 'macro-planner',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const clauses = segmentClauses(context.message)
      if (clauses.length < 2) return null

      const sheetCtx = buildSheetContext(context)
      const steps: ActionStep[] = []

      for (const clause of clauses) {
        const parsed = parseMessage(clause, sheetCtx)
        if (!parsed.understood || parsed.calls.length === 0) {
          return null
        }
        steps.push(...callsToSteps(parsed.calls))
      }

      if (steps.length < 2) return null

      const numbered = steps
        .map((step, i) => `${i + 1}. ${step.description}`)
        .join('\n')

      return {
        success: true,
        message: `${numbered}\n\nClick Apply to run these as one undoable group.`,
        actions: [{
          tool: 'execute_macro',
          params: { steps },
          description: `Run ${steps.length} steps`,
        }],
        stageName: 'macro-planner',
        metadata: { toolUsed: 'macro' },
      }
    },
  }
}
