/**
 * Navigation Stage — find, go-to and select, without an LLM.
 *
 * "go to C5", "select column B", "find rent", "where is the total?". These
 * only move the selection and scroll, so unlike the other fast paths this
 * stage is not gated on act mode: "where is the rent?" classifies as a
 * question, yet the right answer is to show the cell. It is still dropped for
 * non-commands ("how do I find a cell?", "don't select anything"), see
 * buildStages in chatService.
 *
 * Claims when: parseNavigationRequest reads the message.
 * Passes when: it does not (superlatives, analysis and long questions go on).
 */
import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { ExecutionContext } from '@/agent/executor'
import { executeTool } from '@/agent'
import { parseNavigationRequest } from '@/lib/navigation'

export interface NavigationDeps {
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
}

export function createNavigationStage(deps: NavigationDeps): PipelineStage {
  return {
    name: 'navigation',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const request = parseNavigationRequest(context.message)
      if (!request) return null

      const params = request.kind === 'range' ? { range: request.range } : { find: request.text }
      const result = executeTool(
        { tool: 'select_cells', params, description: 'Select cells' },
        deps.buildExecContext({ suppressHistory: true }),
      )
      return {
        success: result.success,
        message: result.message,
        stageName: 'navigation',
        metadata: { toolUsed: 'select_cells' },
      }
    },
  }
}
