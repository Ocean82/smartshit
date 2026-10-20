/**
 * Goal Router — matchGoal → executeGoal → existing tools.
 *
 * Claims matched and ambiguous goal intents. Passes unmatched messages
 * through to the agent parser and the rest of the pipeline.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { ExecutionContext } from '@/agent/executor'
import { executeTool } from '@/agent'
import { allowsFastPathMutation } from '@shared/mode'
import { getToolDefinition } from '@shared/toolRegistry'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { executeGoal, listSuggestedGoals, matchGoal } from '@/ai/goals'
import { shouldAutoApply } from '@/lib/applyPosture'

/** Store-backed collaborators the goal-router stage needs to execute matched goals. */
export interface GoalRouterDeps {
  /** Build an {@link ExecutionContext} for running tools; `suppressHistory` defers the undo entry to the caller. */
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  /** Open a single undo group describing the goal before its tool calls run. */
  pushHistory: (desc: string) => void
}

/**
 * Create the goal-router pipeline stage.
 *
 * Matches the user's message to a known goal (via `matchGoal`), then: returns a
 * clarifying question for an ambiguous match, passes (`null`) for an unmatched
 * one, or executes the matched goal's tool calls. Mutating goals honor the
 * apply posture — auto-applying only when every action is on the low-risk
 * allowlist, otherwise returning Apply/Reject actions for the user to confirm.
 */
export function createGoalRouterStage(deps: GoalRouterDeps): PipelineStage {
  return {
    name: 'goal-router',

    async process(context: PipelineContext): Promise<StageResult | null> {
      if (!allowsFastPathMutation(context.mode)) return null

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

      // Posture gate (mutations only — read-only goals always run inline):
      // auto-apply only when every action in the batch is on the low-risk
      // allowlist (a mixed batch previews as one unit so its single undo group
      // is never fragmented). Everything else returns Apply/Reject actions
      // through the same pending-action path the semantic router uses.
      const posture = context.applyPosture ?? 'preview'
      const everyActionAutoApplies = execution.actions.every((a) => shouldAutoApply(a.tool, posture))
      if (hasMutation && !everyActionAutoApplies) {
        const confirming = /\?\s*$/.test(context.message.trim())
          ? `Yes — I can **${execution.message}**.`
          : execution.message
        return {
          success: true,
          message: `${confirming}\n\nReview, then choose Apply or Reject.`,
          actions: execution.actions.map((a) => ({ tool: a.tool, params: a.params, description: a.description })),
          suggestions,
          stageName: 'goal-router',
          metadata: { goalId: match.goal?.id, matchStatus: 'matched', explain: match.explain, preview: true },
        }
      }

      if (hasMutation) {
        deps.pushHistory(`Goal: ${match.goal?.title ?? 'action'}`)
      }

      const execCtx = deps.buildExecContext({ suppressHistory: true })
      // Synchronous on purpose: pushHistory finalizes its undo diff in a microtask,
      // so an await between steps would leave later steps out of the undo entry.
      const results = execution.actions.map((action) => executeTool({
        tool: action.tool,
        params: action.params,
        description: action.description,
      }, execCtx))

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
