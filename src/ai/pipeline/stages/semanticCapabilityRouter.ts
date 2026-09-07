/**
 * Semantic Capability Router (Tier 2)
 *
 * After deterministic regex (agent-parser) misses, score the user message
 * against capability example embeddings via MiniLM. When confidence is high
 * enough and params resolve, present an Apply preview (mutate) or execute
 * read-only/goal flows — without calling the reasoning LLM.
 *
 * Safety:
 * - Explain/advise/help never claim
 * - Question / hypothetical framings defer to LLM (especially destructive tools)
 * - Compound multi-clause requests defer to macro-planner
 * - Chat mode requires a higher confidence threshold than act mode
 * - Mutating tools return Apply/Reject actions instead of auto-executing
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
import { recordTelemetry } from '@/ai/telemetry'

/** Minimum cosine similarity to claim in act mode. */
export const CAPABILITY_THRESHOLD = 0.58

/** Chat-mode soft commands need a stronger match (less imperative signal). */
export const CAPABILITY_CHAT_THRESHOLD = 0.64

/** Best must beat second-best by this gap to avoid ambiguous claims. */
export const CAPABILITY_AMBIGUITY_GAP = 0.08

/** Tools that reorder or rewrite data — never auto-fire from question framings. */
const DESTRUCTIVE_TOOLS = new Set([
  'sort_sheet',
  'multi_sort',
  'filter',
  'delete_row',
  'clear_sheet',
  'modify_column',
  'find_and_replace',
])

const QUESTION_PREFIXES_RE =
  /^(?:can\s+(?:i|you|we)|should\s+(?:i|we|the)|would\s+(?:it|you)|could\s+(?:i|you|we)|do\s+you(?:\s+(?:think|recommend|suggest))?|how\s+(?:do|can|should)\s+(?:i|we)|is\s+(?:it|there)|what\s+(?:if|happens))\b/i

const COMPOUND_CONNECTOR_RE =
  /\b(?:and\s+then|,\s*then\b|;\s*|after\s+that|\band\s+also\b)/i

export interface SemanticCapabilityRouterDeps {
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  pushHistory: (desc: string) => void
}

function logRoute(
  outcome: 'claim' | 'pass' | 'clarify' | 'preview' | 'ambiguous',
  detail: string,
): void {
  recordTelemetry('capabilityRouterEvents', `${outcome}:${detail}`)
  if (import.meta.env.DEV) {
    console.info(`[CapabilityRouter] ${outcome}: ${detail}`)
  }
}

export function createSemanticCapabilityRouterStage(
  deps: SemanticCapabilityRouterDeps,
): PipelineStage {
  return {
    name: 'semantic-capability-router',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const mode = context.mode ?? classifyMode(context.message)
      if (mode === 'explain' || mode === 'advise' || mode === 'help') return null

      // Compound requests belong to the macro planner, not a single capability.
      if (COMPOUND_CONNECTOR_RE.test(context.message)) return null

      if (!isCapabilityBootstrapped()) return null

      const engine = getNLPEngine()
      if (!engine.isReady) return null

      const embedding = await engine.embed(context.message)
      if (!embedding) return null

      const threshold = mode === 'chat' ? CAPABILITY_CHAT_THRESHOLD : CAPABILITY_THRESHOLD
      const { best, secondScore } = scoreCapabilities(embedding)

      if (!best || best.score < threshold) {
        logRoute(
          'pass',
          `${best?.capabilityId ?? 'none'} score=${best?.score?.toFixed(3) ?? 'n/a'} need>=${threshold}`,
        )
        return null
      }

      if (best.score - secondScore < CAPABILITY_AMBIGUITY_GAP) {
        logRoute(
          'ambiguous',
          `${best.capabilityId} (${best.score.toFixed(3)}) vs ${secondScore.toFixed(3)}`,
        )
        return null
      }

      const spreadsheetCtx = buildSpreadsheetContext(
        context.workbook,
        context.sheet,
        context.selection,
        context.getComputedValue,
      )
      const columns = spreadsheetCtx.profile?.columns

      if (best.capability.kind === 'goal' && best.capability.goalId) {
        if (isQuestionFraming(context.message)) {
          logRoute('pass', `question-framing goal=${best.capabilityId}`)
          return null
        }
        return claimGoal(best.capability.goalId as GoalId, best.score, context, deps)
      }

      const resolved = resolveCapabilityParams(
        best.capability,
        context.message,
        context,
        columns,
      )

      if (isClarification(resolved)) {
        logRoute('clarify', `${best.capabilityId} score=${best.score.toFixed(3)}`)
        return {
          success: true,
          message: resolved.clarification,
          stageName: 'semantic-capability-router',
          metadata: {
            toolUsed: 'clarify',
            capabilityId: best.capabilityId,
            score: best.score,
            tier: 2,
            claimed: false,
          },
        }
      }

      // Question framings must not auto-mutate; destructive tools always defer.
      if (
        isQuestionFraming(context.message)
        && (DESTRUCTIVE_TOOLS.has(resolved.tool) || /\?\s*$/.test(context.message.trim()))
      ) {
        logRoute('pass', `question-framing tool=${resolved.tool}`)
        return null
      }

      const category = getToolDefinition(resolved.tool)?.category
      const isMutation = category === 'mutate' || category === 'template'

      // Soft semantic matches → Apply preview for mutations (safer than auto-exec).
      if (isMutation) {
        logRoute(
          'preview',
          `${best.capabilityId} (${best.score.toFixed(3)}) → ${resolved.tool}`,
        )
        return {
          success: true,
          message: `I will **${resolved.description}**. Review, then choose Apply or Reject.`,
          actions: [{
            tool: resolved.tool,
            params: resolved.params,
            description: resolved.description,
          }],
          stageName: 'semantic-capability-router',
          metadata: {
            toolUsed: resolved.tool,
            capabilityId: best.capabilityId,
            score: best.score,
            tier: 2,
            claimed: true,
            preview: true,
          },
        }
      }

      logRoute('claim', `${best.capabilityId} (${best.score.toFixed(3)}) → ${resolved.tool}`)
      return executeCapabilityTool(resolved, best.capabilityId, best.score, deps)
    },
  }
}

function isQuestionFraming(message: string): boolean {
  const trimmed = message.trim()
  return QUESTION_PREFIXES_RE.test(trimmed.toLowerCase()) || /\?\s*$/.test(trimmed)
}

function isClarification(
  resolved: ReturnType<typeof resolveCapabilityParams>,
): resolved is { clarification: string } {
  return 'clarification' in resolved && !('tool' in resolved)
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
    logRoute('clarify', `goal=${goalId} unmatched`)
    return {
      success: true,
      message: match.explain || `I need the right columns to run ${goalId.replace(/_/g, ' ')}.`,
      stageName: 'semantic-capability-router',
      metadata: { capabilityId: goalId, score, tier: 2, toolUsed: 'clarify', claimed: false },
    }
  }

  if (match.status === 'ambiguous') {
    logRoute('clarify', `goal=${goalId} ambiguous`)
    return {
      success: true,
      message: match.question ?? match.explain,
      suggestions: match.chips,
      stageName: 'semantic-capability-router',
      metadata: { capabilityId: goalId, score, tier: 2, toolUsed: 'clarify', claimed: false },
    }
  }

  const execution = executeGoal(match, spreadsheetCtx.profile, {
    getComputedValue: context.getComputedValue,
    sheet: context.sheet,
  })

  if (execution.actions.length === 0) {
    logRoute('claim', `goal=${goalId} summary-only`)
    return {
      success: true,
      message: execution.message,
      stageName: 'semantic-capability-router',
      metadata: { capabilityId: goalId, score, tier: 2, toolUsed: 'goal', claimed: true },
    }
  }

  // Goal mutations also use Apply so soft semantic routing stays reversible.
  const hasMutation = execution.actions.some((action) => {
    const category = getToolDefinition(action.tool)?.category
    return category === 'mutate' || category === 'template'
  })

  if (hasMutation) {
    logRoute('preview', `goal=${goalId} actions=${execution.actions.length}`)
    return {
      success: true,
      message: `${execution.message}\n\nReview, then choose Apply or Reject.`,
      actions: execution.actions.map((a) => ({
        tool: a.tool,
        params: a.params,
        description: a.description,
      })),
      stageName: 'semantic-capability-router',
      metadata: {
        capabilityId: goalId,
        score,
        tier: 2,
        toolUsed: execution.actions.map((a) => a.tool).join(', '),
        claimed: true,
        preview: true,
      },
    }
  }

  // Read-only goal actions can run immediately
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
  logRoute('claim', `goal=${goalId} executed`)
  return {
    success: allSuccess,
    message: allSuccess
      ? `✓ ${execution.message}`
      : `⚠️ ${results.map((r) => r.message).join('. ')}`,
    stageName: 'semantic-capability-router',
    metadata: {
      capabilityId: goalId,
      score,
      tier: 2,
      toolUsed: execution.actions.map((a) => a.tool).join(', '),
      claimed: true,
    },
  }
}

async function executeCapabilityTool(
  call: { tool: string; params: Record<string, unknown>; description: string },
  capabilityId: string,
  score: number,
  deps: SemanticCapabilityRouterDeps,
): Promise<StageResult> {
  const execCtx = deps.buildExecContext({ suppressHistory: true })
  const result = await executeToolAsync(call, execCtx)

  return {
    success: result.success,
    message: result.success
      ? `✓ ${call.description}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} modified)` : ''}`
      : `⚠️ ${result.message}`,
    stageName: 'semantic-capability-router',
    metadata: {
      toolUsed: call.tool,
      capabilityId,
      score,
      tier: 2,
      modified: result.modified,
      claimed: true,
    },
  }
}
