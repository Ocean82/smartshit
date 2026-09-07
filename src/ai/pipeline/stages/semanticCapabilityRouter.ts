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
 * - Close top-N scores → clarify chips (re-enter chat as NL), not winner-takes-all
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
  type CapabilityScore,
} from '@/ai/nlp/capabilityEmbeddings'
import { resolveCapabilityParams } from '@/ai/capabilities/resolveParams'
import { executeGoal, matchGoal } from '@/ai/goals'
import type { GoalId } from '@/ai/goals/types'
import {
  recordCapabilityRouterTelemetry,
  type CapabilityRouterTelemetryPayload,
} from '@/ai/telemetry'
import type { CapabilityDef } from '@shared/capabilities.js'

/** Conservative claim bar for act mode (prefer false negatives over wrong mutations). */
export const CAPABILITY_THRESHOLD = 0.75

/** Chat-mode soft commands need a slightly stronger match. */
export const CAPABILITY_CHAT_THRESHOLD = 0.78

/** Best must beat second-best by this gap; otherwise clarify among top candidates. */
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

function top3Payload(top: CapabilityScore[]): CapabilityRouterTelemetryPayload['top3Capabilities'] {
  return top.slice(0, 3).map((c) => ({ id: c.capabilityId, score: Number(c.score.toFixed(4)) }))
}

function logRoute(
  payload: Omit<CapabilityRouterTelemetryPayload, 'routedTier'>,
): void {
  recordCapabilityRouterTelemetry({ ...payload, routedTier: 2 })
  if (import.meta.env.DEV) {
    const ids = payload.top3Capabilities.map((c) => `${c.id}=${c.score}`).join(', ')
    console.info(`[CapabilityRouter] ${payload.outcome}: ${ids || 'none'}`)
  }
}

/** NL chip that re-enters the pipeline when the user sends it (option A). */
export function capabilityClarifyChip(capability: CapabilityDef): string {
  const example = capability.examples[0]?.trim()
  if (example) return example.charAt(0).toUpperCase() + example.slice(1)
  return capability.description
}

function buildAmbiguityClarification(
  message: string,
  top: CapabilityScore[],
): { message: string; suggestions: string[] } {
  const candidates = top.filter((c) => c.score > 0).slice(0, 3)
  const suggestions = candidates.map((c) => capabilityClarifyChip(c.capability))
  const bullets = candidates
    .map((c) => `• ${capabilityClarifyChip(c.capability)}`)
    .join('\n')
  const quoted = message.trim().length > 80
    ? `${message.trim().slice(0, 77)}…`
    : message.trim()

  return {
    message: `When you say "${quoted}", do you want me to:\n${bullets}`,
    suggestions,
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
      const { best, secondScore, topCapabilities } = scoreCapabilities(embedding)
      const top3 = top3Payload(topCapabilities)

      if (!best || best.score < threshold) {
        logRoute({
          outcome: 'miss',
          message: context.message,
          top3Capabilities: top3,
          score: best?.score ?? null,
          mode,
        })
        return null
      }

      if (best.score - secondScore < CAPABILITY_AMBIGUITY_GAP) {
        const clarification = buildAmbiguityClarification(context.message, topCapabilities)
        logRoute({
          outcome: 'ambiguous_clarify',
          message: context.message,
          top3Capabilities: top3,
          score: best.score,
          mode,
        })
        return {
          success: true,
          message: clarification.message,
          suggestions: clarification.suggestions,
          stageName: 'semantic-capability-router',
          metadata: {
            toolUsed: 'clarify',
            capabilityId: best.capabilityId,
            score: best.score,
            tier: 2,
            claimed: false,
            top3Capabilities: top3,
            ambiguous: true,
          },
        }
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
          logRoute({
            outcome: 'pass_safety',
            message: context.message,
            top3Capabilities: top3,
            score: best.score,
            mode,
          })
          return null
        }
        return claimGoal(best.capability.goalId as GoalId, best.score, top3, context, deps)
      }

      const resolved = resolveCapabilityParams(
        best.capability,
        context.message,
        context,
        columns,
      )

      if (isClarification(resolved)) {
        logRoute({
          outcome: 'clarify',
          message: context.message,
          top3Capabilities: top3,
          score: best.score,
          mode,
        })
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
            top3Capabilities: top3,
          },
        }
      }

      // Question framings must not auto-mutate; destructive tools always defer.
      if (
        isQuestionFraming(context.message)
        && (DESTRUCTIVE_TOOLS.has(resolved.tool) || /\?\s*$/.test(context.message.trim()))
      ) {
        logRoute({
          outcome: 'pass_safety',
          message: context.message,
          top3Capabilities: top3,
          score: best.score,
          mode,
        })
        return null
      }

      const category = getToolDefinition(resolved.tool)?.category
      const isMutation = category === 'mutate' || category === 'template'

      // Soft semantic matches → Apply preview for mutations (safer than auto-exec).
      if (isMutation) {
        logRoute({
          outcome: 'preview',
          message: context.message,
          top3Capabilities: top3,
          score: best.score,
          mode,
        })
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
            top3Capabilities: top3,
          },
        }
      }

      logRoute({
        outcome: 'claim',
        message: context.message,
        top3Capabilities: top3,
        score: best.score,
        mode,
      })
      return executeCapabilityTool(resolved, best.capabilityId, best.score, top3, deps)
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
  top3: CapabilityRouterTelemetryPayload['top3Capabilities'],
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
    logRoute({
      outcome: 'clarify',
      message: context.message,
      top3Capabilities: top3,
      score,
      mode: context.mode,
    })
    return {
      success: true,
      message: match.explain || `I need the right columns to run ${goalId.replace(/_/g, ' ')}.`,
      stageName: 'semantic-capability-router',
      metadata: {
        capabilityId: goalId,
        score,
        tier: 2,
        toolUsed: 'clarify',
        claimed: false,
        top3Capabilities: top3,
      },
    }
  }

  if (match.status === 'ambiguous') {
    logRoute({
      outcome: 'clarify',
      message: context.message,
      top3Capabilities: top3,
      score,
      mode: context.mode,
    })
    return {
      success: true,
      message: match.question ?? match.explain,
      suggestions: match.chips,
      stageName: 'semantic-capability-router',
      metadata: {
        capabilityId: goalId,
        score,
        tier: 2,
        toolUsed: 'clarify',
        claimed: false,
        top3Capabilities: top3,
      },
    }
  }

  const execution = executeGoal(match, spreadsheetCtx.profile, {
    getComputedValue: context.getComputedValue,
    sheet: context.sheet,
  })

  if (execution.actions.length === 0) {
    logRoute({
      outcome: 'claim',
      message: context.message,
      top3Capabilities: top3,
      score,
      mode: context.mode,
    })
    return {
      success: true,
      message: execution.message,
      stageName: 'semantic-capability-router',
      metadata: {
        capabilityId: goalId,
        score,
        tier: 2,
        toolUsed: 'goal',
        claimed: true,
        top3Capabilities: top3,
      },
    }
  }

  // Goal mutations also use Apply so soft semantic routing stays reversible.
  const hasMutation = execution.actions.some((action) => {
    const category = getToolDefinition(action.tool)?.category
    return category === 'mutate' || category === 'template'
  })

  if (hasMutation) {
    logRoute({
      outcome: 'preview',
      message: context.message,
      top3Capabilities: top3,
      score,
      mode: context.mode,
    })
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
        top3Capabilities: top3,
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
  logRoute({
    outcome: 'claim',
    message: context.message,
    top3Capabilities: top3,
    score,
    mode: context.mode,
  })
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
      top3Capabilities: top3,
    },
  }
}

async function executeCapabilityTool(
  call: { tool: string; params: Record<string, unknown>; description: string },
  capabilityId: string,
  score: number,
  top3: CapabilityRouterTelemetryPayload['top3Capabilities'],
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
      top3Capabilities: top3,
    },
  }
}
