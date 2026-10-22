/**
 * LLMGateway Stage — Server-side LLM communication (terminal stage).
 *
 * This stage ALWAYS claims the input — it's the final fallback in the pipeline.
 * No input should fall through past it.
 *
 * Responsibilities:
 * 1. Build the deterministic summary (insights, audit) for LLM context
 * 2. Send user message + context to server via chatWithAgentServerStream()
 * 3. When act-mode returns read probes: run up to 2 client-side, one follow-up LLM call
 * 4. On LLM failure: show DeterministicDispatcher's local analysis when present;
 *    otherwise fail so chatService runs its local fallback for act/help modes
 * 5. Always returns a StageResult (never null)
 */

import type { LocalAnalysis, PipelineContext, PipelineStage, StageResult } from '../types'
import type { ExecutionContext } from '@/agent/executor'
import { executeTool } from '@/agent'
import { buildFocusData } from '@/ai/focusData'
import { resolveAnalysisTarget } from '@/ai/analysisTarget'
import {
  chatWithAgentServerStream,
  isAgentServerError,
  type AgentChatRequest,
  type ServerAgentAction,
  type ServerChatResponse,
} from '@/ai/agentClient'
import { reportServerUsage } from '@/auth/useUsage'
import { buildAdaptiveContext, getClientContextBudget } from '@/ai/adaptiveContext'
import { formatInsights, mergeToolResultContent } from '@/ai/responseBuilder'
import { isLlmOnlyMode } from '@/ai/mode'
import { runAudit, formatAuditForContext } from '@/auditor'
import { getContextualSuggestions } from '@/ai/contextualSuggestions'
import { isReadProbeTool } from '@shared/toolRegistry'

const MAX_READ_PROBES = 2

export interface LLMGatewayDeps {
  /** Build an execution context for running read probes (no undo history). */
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
}

export function createLLMGatewayStage(deps?: LLMGatewayDeps): PipelineStage {
  return {
    name: 'llm-gateway',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const mode = context.mode ?? 'chat'
      const onToken = context.onToken ?? (() => {})

      const target = resolveAnalysisTarget({
        workbook: context.workbook,
        sheet: context.sheet,
        selection: context.selection,
        getComputedValue: context.getComputedValue,
        getSheetComputedValue: context.getSheetComputedValue,
        attachedPreview: context.attachedPreview,
      })

      const isCloudAvailable = true
      const tokenBudget = getClientContextBudget(isCloudAvailable)

      const sheetContext = buildAdaptiveContext({
        tokenBudget,
        workbook: target.workbook,
        activeSheet: target.sheet,
        selection: context.selection,
        getComputedValue: target.getComputedValue,
        getSheetComputedValue: target.getSheetComputedValue,
      })

      const insightsBlock = isLlmOnlyMode(mode)
        ? formatInsights(sheetContext.insights)
        : ''

      let focusData = ''
      try {
        focusData = buildFocusData({
          message: context.message,
          intent: context.intent,
          sheet: target.sheet,
          getComputedValue: target.getComputedValue,
        })
      } catch {
        // Focus data is an enrichment — continue without it
      }

      let auditBlock = ''
      if (isLlmOnlyMode(mode) || mode === 'advise') {
        try {
          const auditResult = runAudit(target.sheet, target.getComputedValue)
          auditBlock = formatAuditForContext(auditResult)
        } catch {
          // Audit failure is non-fatal — continue without it
        }
      }

      const localAnalysis = context.localAnalysis
      const deterministicSummary = buildSummary(insightsBlock, auditBlock, context.priorInsights, localAnalysis)

      const llmContext: AgentChatRequest['context'] = {
        ...sheetContext,
        deterministicSummary,
        ...(focusData ? { focusData } : {}),
      }

      const clientRouting: AgentChatRequest['clientRouting'] = context.mode && context.intent
        ? {
            mode: context.mode,
            intentType: context.intent.intentType,
            routingSource: context.intent.routingSource ?? 'regex',
            confidence: context.intent.confidence,
          }
        : undefined

      const serverResult = await chatWithAgentServerStream({
        message: context.message,
        context: llmContext,
        history: context.history ?? [],
        clientRouting,
        onToken,
        signal: context.signal,
      })

      if (context.signal?.aborted) {
        return {
          success: true,
          message: 'Stopped. No changes were made.',
          stageName: 'llm-gateway',
          metadata: { toolUsed: 'cancelled', source: 'user-cancelled' },
        }
      }

      if (isAgentServerError(serverResult)) {
        if (localAnalysis) {
          return localAnalysisResult(localAnalysis, serverResult.message, suggestionsForServerError(serverResult.status))
        }
        return {
          success: false,
          message: serverResult.message,
          stageName: 'llm-gateway',
          suggestions: suggestionsForServerError(serverResult.status),
          metadata: {
            toolUsed: 'server-error',
            source: 'ai-server-refused',
            errorStatus: serverResult.status,
            httpStatus: serverResult.httpStatus,
          },
        }
      }

      if (serverResult?.source === 'fallback' && localAnalysis) {
        return localAnalysisResult(localAnalysis, serverResult.message, localAnalysis.suggestions)
      }

      if (serverResult) {
        if (serverResult.usage) {
          reportServerUsage(serverResult.usage.used)
        }

        let finalResult = serverResult
        let usedReadLoop = false

        if (deps?.buildExecContext && hasReadProbes(serverResult.actions)) {
          const followUp = await runReadProbeFollowUp({
            context,
            deps,
            firstResult: serverResult,
            llmContext,
            clientRouting,
            onToken,
          })
          usedReadLoop = true
          if (followUp) {
            finalResult = followUp
            if (followUp.usage) {
              reportServerUsage(followUp.usage.used)
            }
          } else {
            // Probes were requested but follow-up failed — do not surface round-1 mutates.
            finalResult = {
              ...serverResult,
              actions: [],
              message: serverResult.message
                || 'I checked the sheet but could not finish planning the change. Please try again.',
            }
          }
        }

        const contextualSuggestions = getContextualSuggestions({
          insights: sheetContext.insights,
          profile: sheetContext.profile,
          lastUserMessage: context.message,
          hasMultipleSheets: target.workbook.sheets.length > 1,
          sheetNames: target.workbook.sheets.map((s) => s.name),
        })

        const actions = finalResult.actions
          .filter((a) => !isReadProbeTool(a.tool))
          .map((a) => ({
            tool: a.tool,
            params: a.params,
            description: a.description,
          }))

        return {
          success: true,
          message: finalResult.message || 'I looked at your sheet but didn\'t find enough to go on. Try selecting a range or asking a more specific question.',
          actions,
          suggestions: contextualSuggestions.length > 0
            ? contextualSuggestions
            : finalResult.suggestions,
          stageName: 'llm-gateway',
          metadata: {
            toolUsed: 'llm',
            source: finalResult.source,
            reasoning: finalResult.reasoning,
            providerMeta: finalResult.meta,
            routingSource: context.intent?.routingSource,
            ...(usedReadLoop ? { readProbeFollowUp: true } : {}),
          },
        }
      }

      if (localAnalysis) {
        return localAnalysisResult(
          localAnalysis,
          'I couldn\'t reach the AI service, so this is the local analysis only. Try again in a moment for a fuller answer.',
          localAnalysis.suggestions,
        )
      }

      return {
        success: false,
        message: 'I couldn\'t reach the AI service just now. Please try again in a moment.',
        stageName: 'llm-gateway',
        suggestions: ['Try your question again', 'Explain this spreadsheet I just loaded'],
        metadata: {
          toolUsed: 'fallback',
          source: 'ai-server-unavailable',
        },
      }
    },
  }
}

function hasReadProbes(actions: ServerAgentAction[]): boolean {
  return actions.some((a) => isReadProbeTool(a.tool))
}

async function runReadProbeFollowUp(args: {
  context: PipelineContext
  deps: LLMGatewayDeps
  firstResult: ServerChatResponse
  llmContext: AgentChatRequest['context']
  clientRouting: AgentChatRequest['clientRouting']
  onToken: (token: string) => void
}): Promise<ServerChatResponse | null> {
  const { context, deps, firstResult, llmContext, clientRouting, onToken } = args

  const probes = firstResult.actions.filter((a) => isReadProbeTool(a.tool)).slice(0, MAX_READ_PROBES)
  if (probes.length === 0) return null

  const execCtx = deps.buildExecContext({ suppressHistory: true })
  const resultLines: string[] = []
  for (const probe of probes) {
    if (context.signal?.aborted) return null
    try {
      const result = executeTool(
        { tool: probe.tool, params: probe.params, description: probe.description },
        execCtx,
      )
      resultLines.push(
        `- ${probe.tool}: ${result.success ? result.message : `failed — ${result.message}`}`,
      )
    } catch (err) {
      resultLines.push(
        `- ${probe.tool}: failed — ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  if (context.signal?.aborted) return null

  const readBlock = [
    '[Read results]',
    ...resultLines,
    '',
    'Using these results, respond with final JSON only. Emit mutate/execute_script actions (or empty actions). Do not emit read probes.',
  ].join('\n')

  const history = [
    ...(context.history ?? []),
    { role: 'assistant' as const, content: firstResult.message || 'Checking the sheet…' },
    { role: 'user' as const, content: readBlock },
  ]

  const followUp = await chatWithAgentServerStream({
    message: context.message,
    context: llmContext,
    history,
    clientRouting,
    onToken,
    signal: context.signal,
  })

  if (context.signal?.aborted) return null
  if (isAgentServerError(followUp) || !followUp) return null
  if (followUp.source === 'fallback') return null

  return {
    ...followUp,
    actions: followUp.actions.filter((a) => !isReadProbeTool(a.tool)),
  }
}

function buildSummary(
  insightsBlock: string,
  auditBlock: string,
  priorInsights?: import('@/ai/sheetInsights').SheetInsights | null,
  localAnalysis?: LocalAnalysis,
): string {
  const parts: string[] = []

  const hasRicherContext = Boolean(insightsBlock || localAnalysis)
  if (priorInsights && !hasRicherContext) {
    parts.push('This is a follow-up question in an ongoing conversation about the same sheet.')
  }
  if (localAnalysis) {
    parts.push(`Local budget analysis computed from this sheet (build on it with judgment; do not just repeat it):\n${localAnalysis.message}`)
  }
  if (insightsBlock) {
    parts.push(`Deterministic sheet findings:\n${insightsBlock}`)
  }
  if (auditBlock) {
    parts.push(auditBlock)
  }

  return mergeToolResultContent(parts.filter(Boolean))
}

function localAnalysisResult(analysis: LocalAnalysis, notice: string, suggestions?: string[]): StageResult {
  return {
    success: true,
    message: `${analysis.message}\n\n> ${notice}`,
    stageName: 'llm-gateway',
    suggestions,
    metadata: {
      toolUsed: analysis.toolUsed,
      source: 'local-fallback',
    },
  }
}

function suggestionsForServerError(
  status: 'rate_limited' | 'auth' | 'quota' | 'error',
): string[] {
  switch (status) {
    case 'rate_limited':
      return ['Wait a moment, then try again']
    case 'auth':
      return ['Sign in again']
    case 'quota':
      return ['Upgrade to Pro', 'Add your own API key']
    default:
      return ['Try your question again']
  }
}
