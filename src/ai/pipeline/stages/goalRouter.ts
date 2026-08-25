/**
 * Goal Router — matchGoal → executeGoal → existing tools.
 *
 * Claims matched and ambiguous goal intents. Passes unmatched messages
 * through to the agent parser and the rest of the pipeline.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { ExecutionContext } from '@/agent/executor'
import { executeToolAsync } from '@/agent'
import { getToolDefinition } from '@shared/toolRegistry'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { executeGoal, listSuggestedGoals, matchGoal } from '@/ai/goals'

export interface GoalRouterDeps {
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  pushHistory: (desc: string) => void
}

export function createGoalRouterStage(deps: GoalRouterDeps): PipelineStage {
  return {
    name: 'goal-router',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const spreadsheetCtx = buildSpreadsheetContext(
        context.workbook,
        context.sheet,
        context.selection,
        context.getComputedValue,
      )

      const match = matchGoal({
        profile: spreadsheetCtx.profile,
        selection: context.selection,
        utterance: context.message,
      })

      if (match.status === 'unmatched') return null

      if (match.status === 'ambiguous') {
        return {
          success: true,
          message: match.question ?? match.explain,
          suggestions: match.chips,
          stageName: 'goal-router',
          metadata: { goalId: match.goal?.id, matchStatus: 'ambiguous', explain: match.explain },
        }
      }

      const execution = executeGoal(match, spreadsheetCtx.profile, {
        getComputedValue: context.getComputedValue,
        sheet: context.sheet,
      })
      const suggestions = listSuggestedGoals(spreadsheetCtx.profile)
        .map((item) => item.goal?.title)
        .filter((title): title is string => Boolean(title))
        .slice(0, 3)

      if (execution.actions.length === 0) {
        return {
          success: true,
          message: execution.message,
          suggestions,
          stageName: 'goal-router',
          metadata: { goalId: match.goal?.id, matchStatus: 'matched', explain: match.explain },
        }
      }

      const hasMutation = execution.actions.some((action) => {
        const category = getToolDefinition(action.tool)?.category
        return category === 'mutate' || category === 'template'
      })
      if (hasMutation) {
        deps.pushHistory(`Goal: ${match.goal?.title ?? 'action'}`)
      }

      const execCtx = deps.buildExecContext({ suppressHistory: true })
      const results = []
      for (const action of execution.actions) {
        results.push(await executeToolAsync({
          tool: action.tool,
          params: action.params,
          description: action.description,
        }, execCtx))
      }

      const allSuccess = results.every((result) => result.success)
      const totalModified = results.reduce((sum, result) => sum + result.modified, 0)
      const toolMessages = results.map((result) => result.message).join('. ')

      return {
        success: allSuccess,
        message: allSuccess
          ? `✓ ${execution.message}${totalModified > 0 ? ` (${totalModified} cell${totalModified === 1 ? '' : 's'} modified)` : ''}`
          : `⚠️ ${toolMessages}\n\n${match.explain}`,
        stageName: 'goal-router',
        metadata: {
          goalId: match.goal?.id,
          matchStatus: 'matched',
          explain: match.explain,
          modified: totalModified,
          toolUsed: execution.actions.map((action) => action.tool).join(', '),
        },
        suggestions,
      }
    },
  }
}
