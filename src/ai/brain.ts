import { parseUserIntent, isQueryIntent } from '@/ai/intentParser'
import { classifyMode, isBudgetExplainQuery, isLlmOnlyMode } from '@/ai/mode'
import { resolveAnalysisTarget, type AnalysisTarget } from '@/ai/analysisTarget'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/skills/budget'
import { generateReport } from '@/ai/skills/reporting'
import { runCleaningSkill } from '@/ai/skills/cleaning'
import { runQueryFromIntent } from '@/ai/queryEngine'
import { formatInsights, mergeToolResultContent, toolResultToMessage } from '@/ai/responseBuilder'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import { recordTelemetry } from '@/ai/telemetry'
import { runAudit, formatAuditForContext } from '@/auditor'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { AttachedFilePreview, ToolResult } from '@/ai/types'
import type { Selection, SheetData, WorkbookData } from '@/types'

export interface ProcessMessageInput {
  message: string
  workbook: WorkbookData
  sheet: SheetData
  selection: Selection | null
  getComputedValue: (row: number, col: number) => string
  attachedPreview?: AttachedFilePreview | null
  priorInsights?: SheetInsights | null
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  onToken?: (token: string) => void
}

function withTool(result: ToolResult, toolUsed: string): ToolResult {
  return { ...result, toolUsed }
}

function runDeterministicSkills(
  target: AnalysisTarget,
  workbookName: string,
  message: string,
  mode: ReturnType<typeof classifyMode>,
  intent: ReturnType<typeof parseUserIntent>,
): ToolResult | null {
  const profile = buildSheetProfile(target.sheet, target.getComputedValue)
  const insights = target.context.insights

  if (intent.intentType === 'clean') {
    return withTool(runCleaningSkill(target.sheet), 'cleaning')
  }

  if (intent.intentType === 'report') {
    return withTool(generateReport(profile, insights, workbookName), 'reporting')
  }

  if (isQueryIntent(intent)) {
    const queryResult = runQueryFromIntent(target.sheet, intent, target.getComputedValue, insights)
    return queryResult ? withTool(queryResult, 'query') : null
  }

  if (mode === 'advise' || intent.intentType === 'budget') {
    const monthlyIncome = typeof intent.parameters.monthlyIncome === 'number'
      ? intent.parameters.monthlyIncome
      : insights.totalIncome

    if (monthlyIncome && monthlyIncome > 0) {
      return withTool(savingsRecommendation(monthlyIncome, insights), 'budget')
    }

    return withTool(budgetAnalysisToToolResult(analyzeBudget(profile, insights)), 'budget')
  }

  if (mode === 'explain' && profile.detectedPurpose === 'budget' && isBudgetExplainQuery(message)) {
    return withTool(budgetAnalysisToToolResult(analyzeBudget(profile, insights)), 'budget')
  }

  return null
}

function buildDeterministicSummary(
  insightsBlock: string,
  deterministicText: string,
  auditBlock: string,
  priorInsights?: SheetInsights | null,
  currentInsights?: SheetInsights,
): string {
  const parts: string[] = []
  if (priorInsights && currentInsights
    && priorInsights.headers?.join() === currentInsights.headers?.join()) {
    parts.push('Prior turn insights still apply for follow-up questions.')
  }
  if (insightsBlock) parts.push(`Deterministic sheet findings:\n${insightsBlock}`)
  if (deterministicText) parts.push(`Deterministic recommendation:\n${deterministicText}`)
  if (auditBlock) parts.push(auditBlock)
  return mergeToolResultContent(parts.filter(Boolean))
}

export async function processMessage(input: ProcessMessageInput): Promise<ToolResult> {
  const mode = classifyMode(input.message)
  const intent = parseUserIntent(input.message)
  const target = resolveAnalysisTarget(input)

  const deterministic = runDeterministicSkills(
    target,
    input.workbook.name,
    input.message,
    mode,
    intent,
  )
  const deterministicText = deterministic ? toolResultToMessage(deterministic, { includeSuggestionsInBody: false }) : ''
  const insightsBlock = isLlmOnlyMode(mode) ? formatInsights(target.context.insights) : ''

  // Run the auditor for context (only on explain/advise modes where it's useful)
  let auditBlock = ''
  if (isLlmOnlyMode(mode) || mode === 'advise') {
    try {
      const auditResult = runAudit(input.sheet, input.getComputedValue)
      auditBlock = formatAuditForContext(auditResult)
    } catch {
      // Audit failure is non-fatal — continue without it
    }
  }

  if (deterministic && !isLlmOnlyMode(mode) && deterministic.actions?.length) {
    recordTelemetry('deterministicResponses', deterministic.toolUsed ?? 'deterministic-action')
    return deterministic
  }

  if (deterministicText && input.onToken) {
    input.onToken(`${deterministicText}\n\n`)
  }

  const serverResult = await chatWithAgentServerStream(
    input.message,
    {
      ...target.context,
      deterministicSummary: buildDeterministicSummary(
        insightsBlock,
        deterministicText,
        auditBlock,
        input.priorInsights,
        target.context.insights,
      ),
    },
    input.history ?? [],
    input.onToken ?? (() => {}),
  )

  if (serverResult) {
    const llmText = serverResult.message
    const combined = mergeToolResultContent([
      deterministicText,
      insightsBlock && !deterministicText.includes('Sheet insights') ? insightsBlock : '',
      llmText,
    ].filter(Boolean))

    if (deterministicText.trim().length > 0 && llmText.trim().length > 0) {
      recordTelemetry('hybridResponses', deterministic?.toolUsed ?? 'hybrid')
    } else {
      recordTelemetry('llmResponses', serverResult.source)
    }

    return {
      success: true,
      message: combined,
      toolUsed: deterministic?.toolUsed ?? 'llm',
      suggestions: deterministic?.suggestions ?? serverResult.suggestions,
      actions: serverResult.actions.map((a) => ({
        tool: a.tool,
        params: a.params,
        description: a.description,
      })),
    }
  }

  if (deterministic) {
    recordTelemetry('deterministicResponses', deterministic.toolUsed ?? 'deterministic')
    return deterministic
  }

  recordTelemetry('fallbackResponses', 'ai-server-unavailable')
  return {
    success: false,
    message: 'AI server is unavailable. Start it with `npm run dev:server` and try again.',
    toolUsed: 'fallback',
    suggestions: ['Check that a cloud API key or local Ollama model is configured.'],
  }
}
