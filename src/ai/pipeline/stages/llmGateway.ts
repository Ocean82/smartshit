/**
 * LLMGateway Stage — Server-side LLM communication (terminal stage).
 *
 * This stage ALWAYS claims the input — it's the final fallback in the pipeline.
 * No input should fall through past it.
 *
 * Responsibilities:
 * 1. Build the deterministic summary (insights, audit) for LLM context
 * 2. Send user message + context to server via chatWithAgentServerStream()
 * 3. On LLM failure: show DeterministicDispatcher's local analysis when present;
 *    otherwise fail so chatService runs its local fallback for act/help modes
 * 4. Always returns a StageResult (never null)
 *
 * REQ-7.1: Send message to server-side LLM
 * REQ-7.2: Always claims (terminal stage)
 * REQ-7.3: On LLM failure + non-explain/advise → local fallback (via chatService)
 * REQ-7.4: Pass conversation history, sheet context, deterministic summary
 */

import type { LocalAnalysis, PipelineContext, PipelineStage, StageResult } from '../types'
import { buildFocusData } from '@/ai/focusData'
import { resolveAnalysisTarget } from '@/ai/analysisTarget'
import { chatWithAgentServerStream, isAgentServerError } from '@/ai/agentClient'
import { reportServerUsage } from '@/auth/useUsage'
import { buildAdaptiveContext, getClientContextBudget } from '@/ai/adaptiveContext'
import { formatInsights, mergeToolResultContent } from '@/ai/responseBuilder'
import { isLlmOnlyMode } from '@/ai/mode'
import { runAudit, formatAuditForContext } from '@/auditor'
import { getContextualSuggestions } from '@/ai/contextualSuggestions'

export function createLLMGatewayStage(): PipelineStage {
  return {
    name: 'llm-gateway',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const mode = context.mode ?? 'chat'
      const onToken = context.onToken ?? (() => {})

      // Resolve the analysis target the same way the deterministic path does,
      // so an attached file/preview is analyzed instead of the active sheet.
      const target = resolveAnalysisTarget({
        workbook: context.workbook,
        sheet: context.sheet,
        selection: context.selection,
        getComputedValue: context.getComputedValue,
        getSheetComputedValue: context.getSheetComputedValue,
        attachedPreview: context.attachedPreview,
      })

      // Build spreadsheet context payload for the server
      // Use adaptive context for multi-sheet workbooks (budget-aware compression)
      const isCloudAvailable = true // LLM gateway implies cloud/Ollama is available
      const tokenBudget = getClientContextBudget(isCloudAvailable)

      const sheetContext = buildAdaptiveContext({
        tokenBudget,
        workbook: target.workbook,
        activeSheet: target.sheet,
        selection: context.selection,
        getComputedValue: target.getComputedValue,
        getSheetComputedValue: target.getSheetComputedValue,
      })

      // Build deterministic summary for LLM context enrichment. Follow-ups keep
      // the full write-up: the model has no memory of the prior turn's context.
      const insightsBlock = isLlmOnlyMode(mode)
        ? formatInsights(sheetContext.insights)
        : ''

      // Exact values for cells/columns the question names (non-fatal)
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

      // Run auditor for explain/advise modes (non-fatal)
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

      // REQ-7.1, REQ-7.4: Send message + history + context to server LLM
      const serverResult = await chatWithAgentServerStream({
        message: context.message,
        context: {
          ...sheetContext,
          deterministicSummary,
          ...(focusData ? { focusData } : {}),
        },
        history: context.history ?? [],
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

      // Server explicitly refused (auth / rate limit / quota). Surface its
      // worded message as a real assistant reply so the "sign in / slow down /
      // upgrade" CTA is never hidden. A local analysis, when present, is shown
      // with that message appended as a notice.
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

      // The server answers with source 'fallback' when every provider failed or
      // the free-tier quota is used up; the local analysis is still worth showing.
      if (serverResult?.source === 'fallback' && localAnalysis) {
        return localAnalysisResult(localAnalysis, serverResult.message, localAnalysis.suggestions)
      }

      if (serverResult) {
        // Reconcile the client's optimistic usage counter to the server's
        // authoritative post-request count. Present only when the server
        // actually metered this turn (free tier, server LLM used) — so local
        // fallbacks and failed turns no longer leave the local count drifting.
        if (serverResult.usage) {
          reportServerUsage(serverResult.usage.used)
        }

        // Successful LLM response
        const contextualSuggestions = getContextualSuggestions({
          insights: sheetContext.insights,
          profile: sheetContext.profile,
          lastUserMessage: context.message,
          hasMultipleSheets: target.workbook.sheets.length > 1,
          sheetNames: target.workbook.sheets.map((s) => s.name),
        })

        return {
          success: true,
          message: serverResult.message || 'I looked at your sheet but didn\'t find enough to go on. Try selecting a range or asking a more specific question.',
          actions: serverResult.actions.map((a) => ({
            tool: a.tool,
            params: a.params,
            description: a.description,
          })),
          suggestions: contextualSuggestions.length > 0
            ? contextualSuggestions
            : serverResult.suggestions,
          stageName: 'llm-gateway',
          metadata: {
            toolUsed: 'llm',
            source: serverResult.source,
            reasoning: serverResult.reasoning,
            providerMeta: serverResult.meta,
            routingSource: context.intent?.routingSource,
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

      // REQ-7.3: act/help failures return success:false so chatService runs processLocalFallback
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

/**
 * Build the deterministic summary string passed to the LLM for context.
 * Combines insights, audit findings, and prior-turn continuity hints.
 */
function buildSummary(
  insightsBlock: string,
  auditBlock: string,
  priorInsights?: import('@/ai/sheetInsights').SheetInsights | null,
  localAnalysis?: LocalAnalysis,
): string {
  const parts: string[] = []

  if (priorInsights) {
    parts.push('Prior turn insights still apply for follow-up questions.')
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

/** Show the local analysis on its own when the model can't answer, with the reason underneath. */
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

/** Follow-up chips tailored to why the server refused the request. */
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
