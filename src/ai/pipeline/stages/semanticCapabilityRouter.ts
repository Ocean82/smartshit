/**
 * Semantic Capability Router (Tier 2)
 *
 * After deterministic regex (agent-parser) misses, score the user message
 * against capability example embeddings via MiniLM. When confidence is high
 * enough and params resolve, execute the mapped tool (or goal) without LLM.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import type { ExecutionContext } from '@/agent/executor'
import { executeToolAsync } from '@/agent'
import { getToolDefinition } from '@shared/toolRegistry'
import { classifyMode } from '@shared/mode'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { getNLPEngine } from '@/ai/nlp/nlpEngine'
import {
  isCapabilityBootstrapped,
  scoreCapabilities,
} from '@/ai/nlp/capabilityEmbeddings'
import { resolveCapabilityParams } from '@/ai/capabilities/resolveParams'
import { executeGoal, matchGoal } from '@/ai/goals'
import type { GoalId } from '@/ai/goals/types'

/** Minimum cosine similarity to claim a capability. */
export const CAPABILITY_THRESHOLD = 0.55

/** Best must beat second-best by this gap to avoid ambiguous claims. */
export const CAPABILITY_AMBIGUITY_GAP = 0.05

export interface SemanticCapabilityRouterDeps {
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  pushHistory: (desc: string) => void
}

export function createSemanticCapabilityRouterStage(
  deps: SemanticCapabilityRouterDeps,
): PipelineStage {
  return {
    name: 'semantic-capability-router',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const mode = context.mode ?? classifyMode(context.message)
      // Explain/advise stay on the reasoning LLM. Act + chat soft commands may claim.
      if (mode === 'explain' || mode === 'advise' || mode === 'help') return null

      if (!isCapabilityBootstrapped()) return null

      const engine = getNLPEngine()
      if (!engine.isReady) return null

      const embedding = await engine.embed(context.message)
      if (!embedding) return null

      const { best, secondScore } = scoreCapabilities(embedding)
      if (!best || best.score < CAPABILITY_THRESHOLD) {
        if (import.meta.env.DEV) {
          console.info(
            `[CapabilityRouter] pass: best=${best?.capabilityId ?? 'none'} score=${best?.score?.toFixed(3) ?? 'n/a'}`,
          )
        }
        return null
      }

      if (best.score - secondScore < CAPABILITY_AMBIGUITY_GAP) {
        if (import.meta.env.DEV) {
          console.info(
            `[CapabilityRouter] ambiguous: ${best.capabilityId} (${best.score.toFixed(3)}) vs ${secondScore.toFixed(3)}`,
          )
        }
        return null
      }

      const spreadsheetCtx = buildSpreadsheetContext(
        context.workbook,
        context.sheet,
        context.selection,
        context.getComputedValue,
      )
      const columns = spreadsheetCtx.profile?.columns

      // Goal capabilities — run through goal matcher/executor
      if (best.capability.kind === 'goal' && best.capability.goalId) {
        return claimGoal(best.capability.goalId as GoalId, best.score, context, deps)
      }

      const resolved = resolveCapabilityParams(
        best.capability,
        context.message,
        context,
        columns,
      )

      if ('clarification' in resolved && !('tool' in resolved)) {
        return {
          success: true,
          message: resolved.clarification,
          stageName: 'semantic-capability-router',
          metadata: {
            toolUsed: 'clarify',
            capabilityId: best.capabilityId,
            score: best.score,
            tier: 2,
          },
        }
      }

      const call = resolved as {
        tool: string
        params: Record<string, unknown>
        description: string
      }

      if (import.meta.env.DEV) {
        console.info(
          `[CapabilityRouter] claim: ${best.capabilityId} (${best.score.toFixed(3)}) → ${call.tool}`,
        )
      }

      return executeCapabilityTool(call, best.capabilityId, best.score, deps)
    },
  }
}

async function claimGoal(
  goalId: GoalId,
  score: number,
  context: PipelineContext,
  deps: SemanticCapabilityRouterDeps,
): Promise<StageResult | null> {
  const spreadsheetCtx = buildSpreadsheetContext(
    context.workbook,
    context.sheet,
    context.selection,
    context.getComputedValue,
  )

  const canonicalUtterance =
    goalId === 'by_category' ? 'totals by category'
      : goalId === 'by_month' ? 'totals by month'
        : 'total'

  let match = matchGoal({
    profile: spreadsheetCtx.profile,
    selection: context.selection,
    utterance: context.message,
  })

  if (match.status === 'unmatched' || match.goal?.id !== goalId) {
    match = matchGoal({
      profile: spreadsheetCtx.profile,
      selection: context.selection,
      utterance: canonicalUtterance,
    })
  }

  if (match.status === 'unmatched' || match.goal?.id !== goalId) {
    return {
      success: true,
      message: match.explain || `I need the right columns to run ${goalId.replace(/_/g, ' ')}.`,
      stageName: 'semantic-capability-router',
      metadata: { capabilityId: goalId, score, tier: 2, toolUsed: 'clarify' },
    }
  }

  if (match.status === 'ambiguous') {
    return {
      success: true,
      message: match.question ?? match.explain,
      suggestions: match.chips,
      stageName: 'semantic-capability-router',
      metadata: { capabilityId: goalId, score, tier: 2, toolUsed: 'clarify' },
    }
  }

  const execution = executeGoal(match, spreadsheetCtx.profile, {
    getComputedValue: context.getComputedValue,
    sheet: context.sheet,
  })

  if (execution.actions.length === 0) {
    return {
      success: true,
      message: execution.message,
      stageName: 'semantic-capability-router',
      metadata: { capabilityId: goalId, score, tier: 2, toolUsed: 'goal' },
    }
  }

  const hasMutation = execution.actions.some((action) => {
    const category = getToolDefinition(action.tool)?.category
    return category === 'mutate' || category === 'template'
  })
  if (hasMutation) {
    deps.pushHistory(`Goal: ${match.goal?.title ?? goalId}`)
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

  const allSuccess = results.every((r) => r.success)
  const totalModified = results.reduce((sum, r) => sum + r.modified, 0)

  return {
    success: allSuccess,
    message: allSuccess
      ? `✓ ${execution.message}${totalModified > 0 ? ` (${totalModified} cell${totalModified === 1 ? '' : 's'} modified)` : ''}`
      : `⚠️ ${results.map((r) => r.message).join('. ')}`,
    stageName: 'semantic-capability-router',
    metadata: {
      capabilityId: goalId,
      score,
      tier: 2,
      toolUsed: execution.actions.map((a) => a.tool).join(', '),
      modified: totalModified,
    },
  }
}

async function executeCapabilityTool(
  call: { tool: string; params: Record<string, unknown>; description: string },
  capabilityId: string,
  score: number,
  deps: SemanticCapabilityRouterDeps,
  explanation?: string,
): Promise<StageResult> {
  const hasMutation = (() => {
    const category = getToolDefinition(call.tool)?.category
    return category === 'mutate' || category === 'template'
  })()
  if (hasMutation) {
    deps.pushHistory(`AI: ${explanation || call.description}`)
  }

  const execCtx = deps.buildExecContext({ suppressHistory: true })
  const result = await executeToolAsync(call, execCtx)

  return {
    success: result.success,
    message: result.success
      ? `✓ ${explanation || call.description}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} modified)` : ''}`
      : `⚠️ ${result.message}`,
    stageName: 'semantic-capability-router',
    metadata: {
      toolUsed: call.tool,
      capabilityId,
      score,
      tier: 2,
      modified: result.modified,
    },
  }
}
