/**
 * LLMGateway Stage — Server-side LLM communication (terminal stage).
 *
 * This stage ALWAYS claims the input — it's the final fallback in the pipeline.
 * No input should fall through past it.
 *
 * Responsibilities:
 * 1. Build the deterministic summary (insights, audit) for LLM context
 * 2. Send user message + context to server via chatWithAgentServerStream()
 * 3. On LLM failure for non-explain/advise mode: use local fallback (insights)
 * 4. Always returns a StageResult (never null)
 *
 * REQ-7.1: Send message to server-side LLM
 * REQ-7.2: Always claims (terminal stage)
 * REQ-7.3: On LLM failure + non-explain/advise → local fallback
 * REQ-7.4: Pass conversation history, sheet context, deterministic summary
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import { buildSpreadsheetContext } from '@/ai/buildContext'
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

      // Build spreadsheet context payload for the server
      // Use adaptive context for multi-sheet workbooks (budget-aware compression)
      const isCloudAvailable = true // LLM gateway implies cloud/Ollama is available
      const tokenBudget = getClientContextBudget(isCloudAvailable)

      const sheetContext = buildAdaptiveContext({
        tokenBudget,
        workbook: context.workbook,
        activeSheet: context.sheet,
        selection: context.selection,
        getComputedValue: context.getComputedValue,
      })

      // Build deterministic summary for LLM context enrichment
      const isFollowUp = Boolean(context.priorInsights)
      const insightsBlock = isLlmOnlyMode(mode) && !isFollowUp
        ? formatInsights(sheetContext.insights)
        : ''

      // Run auditor for explain/advise modes (non-fatal)
      let auditBlock = ''
      if (isLlmOnlyMode(mode) || mode === 'advise') {
        try {
          const auditResult = runAudit(context.sheet, context.getComputedValue)
          auditBlock = formatAuditForContext(auditResult)
        } catch {
          // Audit failure is non-fatal — continue without it
        }
      }

      const deterministicSummary = buildSummary(insightsBlock, auditBlock, context.priorInsights)

      // REQ-7.1, REQ-7.4: Send message + history + context to server LLM
      const serverResult = await chatWithAgentServerStream({
        message: context.message,
        context: {
          ...sheetContext,
          deterministicSummary,
        },
        history: context.history ?? [],
        onToken,
      })

      if (serverResult) {
        // Successful LLM response
        const contextualSuggestions = getContextualSuggestions({
          insights: sheetContext.insights,
          profile: sheetContext.profile,
          lastUserMessage: context.message,
          hasMultipleSheets: context.workbook.sheets.length > 1,
          sheetNames: context.workbook.sheets.map((s) => s.name),
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
          },
        }
      }

      // REQ-7.3: LLM failed — use local fallback for non-explain/advise modes
      if (!isLlmOnlyMode(mode) && insightsBlock) {
        // For act/help modes, return insights as a useful local fallback
        return {
          success: true,
          message: insightsBlock,
          stageName: 'llm-gateway',
          suggestions: ['Try your question again', 'Explain this spreadsheet I just loaded'],
          metadata: {
            toolUsed: 'insights',
            source: 'local-fallback',
          },
        }
      }

      // Final fallback — server unreachable, no useful local content
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
): string {
  const parts: string[] = []

  if (priorInsights) {
    parts.push('Prior turn insights still apply for follow-up questions.')
  }
  if (insightsBlock) {
    parts.push(`Deterministic sheet findings:\n${insightsBlock}`)
  }
  if (auditBlock) {
    parts.push(auditBlock)
  }

  return mergeToolResultContent(parts.filter(Boolean))
}
