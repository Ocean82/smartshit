/**
 * Real step executor — maps ActionStep → executeToolAsync.
 * Replaces the silent stub success path for production macro runs.
 */

import type { ExecutionContext } from '@/agent/executor'
import { executeToolAsync } from '@/agent'
import { resolveToolName } from '@shared/toolRegistry'
import type { ActionStep, ToolResult } from '@/ai/nlp/types'
import type { StepExecutor } from './macroExecutor'

/** NLP intent names that differ from canonical tool registry names */
const INTENT_TO_TOOL: Record<string, string> = {
  sort: 'sort_sheet',
  format: 'format_cells',
}

/** Map NLP operator entity values onto filter condition strings */
const OPERATOR_TO_CONDITION: Record<string, string> = {
  'greater-than': 'gt',
  'less-than': 'lt',
  'equal-to': 'equals',
  'greater-than-or-equal': 'gte',
  'less-than-or-equal': 'lte',
  'not-equal-to': 'notEquals',
  gt: 'gt',
  lt: 'lt',
  gte: 'gte',
  lte: 'lte',
  eq: 'equals',
  equals: 'equals',
}

function resolveStepTool(raw: string): string {
  const mapped = INTENT_TO_TOOL[raw] ?? raw
  return resolveToolName(mapped)
}

/**
 * Normalize NLP-style params into shapes the agent executor expects.
 * - columns[] → column (first entry)
 * - values/operators → filter condition + value
 */
export function normalizeStepParams(
  tool: string,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...params }

  if (Array.isArray(next.columns) && next.columns.length > 0 && next.column == null) {
    next.column = next.columns[0]
  }

  if (tool === 'filter') {
    const operators = Array.isArray(next.operators) ? next.operators : []
    const values = Array.isArray(next.values) ? next.values : []
    if (next.condition == null && (operators.length > 0 || values.length > 0)) {
      const opRaw = typeof operators[0] === 'string' ? operators[0] : 'equals'
      next.condition = OPERATOR_TO_CONDITION[opRaw] ?? opRaw
      if (values.length > 0 && next.value == null) {
        next.value = values[0]
      }
    }
  }

  return next
}

export function createToolStepExecutor(getCtx: () => ExecutionContext): StepExecutor {
  return async (step: ActionStep, _context: ToolResult[]): Promise<ToolResult> => {
    const tool = resolveStepTool(step.tool)
    const params = normalizeStepParams(tool, step.params ?? {})
    const result = await executeToolAsync(
      {
        tool,
        params,
        description: step.description,
      },
      getCtx(),
    )

    return {
      success: result.success,
      data: { modified: result.modified, message: result.message },
      error: result.success ? undefined : result.message,
    }
  }
}
