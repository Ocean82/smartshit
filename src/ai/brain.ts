import { parseUserIntent, isQueryIntent } from '@/ai/intentParser'
import { classifyMode, isBudgetExplainQuery, isLlmOnlyMode } from '@/ai/mode'
import { resolveAnalysisTarget, type AnalysisTarget } from '@/ai/analysisTarget'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/skills/budget'
import { generateReport } from '@/ai/skills/reporting'
import { runCleaningSkill } from '@/ai/skills/cleaning'
import { runQueryFromIntent } from '@/ai/queryEngine'
import { formatInsights, explainOutliers, mergeToolResultContent, toolResultToMessage } from '@/ai/responseBuilder'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import { recordTelemetry } from '@/ai/telemetry'
import { runAudit, formatAuditForContext } from '@/auditor'
import type { SheetInsights } from '@/ai/sheetInsights'
import { isOutlierFollowUp } from '@/ai/outliers'
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

function resolveOutliersForFollowUp(
  current: SheetInsights,
  prior?: SheetInsights | null,
): NonNullable<SheetInsights['outliers']> {
  if (current.outliers?.length) return current.outliers
  if (prior?.outliers?.length) return prior.outliers
  return []
}

function runDeterministicSkills(
  target: AnalysisTarget,
  workbookName: string,
  message: string,
  mode: ReturnType<typeof classifyMode>,
  intent: ReturnType<typeof parseUserIntent>,
  priorInsights?: SheetInsights | null,
): ToolResult | null {
  const profile = buildSheetProfile(target.sheet, target.getComputedValue)
  const insights = target.context.insights

  // Follow-ups about "unusual values" — answer from stats, no LLM required
  if (isOutlierFollowUp(message)) {
    const outliers = resolveOutliersForFollowUp(insights, priorInsights)
    return withTool({
      success: true,
      message: explainOutliers(outliers),
      suggestions: outliers.length
        ? [
            'Check those rows for typos or missing decimals',
            'Filter to only the flagged rows',
            'Explain this spreadsheet I just loaded',
          ]
        : ['Analyze my data for patterns', 'Explain this spreadsheet I just loaded'],
    }, 'outlier-explain')
  }

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
    input.priorInsights,
  )
  const deterministicText = deterministic ? toolResultToMessage(deterministic, { includeSuggestionsInBody: false }) : ''

  // Outlier follow-ups are fully answered locally — skip LLM to avoid clarification loops
  if (deterministic?.toolUsed === 'outlier-explain') {
    recordTelemetry('deterministicResponses', 'outlier-explain')
    if (input.onToken) input.onToken(deterministicText)
    return deterministic
  }

  // Only dump the full insights block on first-pass explain/advise, not every follow-up
  const isFollowUp = Boolean(input.priorInsights)
  const insightsBlock = isLlmOnlyMode(mode) && !isFollowUp
    ? formatInsights(target.context.insights)
    : ''

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
    // Never append fallback disclaimers on top of real sheet findings — that reads as "AI is broken"
    const llmText = serverResult.source === 'fallback'
      && (deterministicText.trim() || insightsBlock.trim())
      ? ''
      : serverResult.message
    const combined = mergeToolResultContent([
      deterministicText,
      insightsBlock && !deterministicText.includes('Sheet insights') ? insightsBlock : '',
      llmText,
    ].filter(Boolean))

    if (deterministicText.trim().length > 0 && llmText.trim().length > 0) {
      recordTelemetry('hybridResponses', deterministic?.toolUsed ?? 'hybrid')
    } else if (llmText.trim().length > 0) {
      recordTelemetry('llmResponses', serverResult.source)
    } else {
      recordTelemetry('deterministicResponses', deterministic?.toolUsed ?? 'local-insights')
    }

    return {
      success: true,
      message: combined || 'I looked at your sheet but didn\'t find enough to go on. Try selecting a range or asking a more specific question.',
      toolUsed: deterministic?.toolUsed ?? (llmText ? 'llm' : 'insights'),
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

  // Local insights still useful when the AI server is down — no scary "AI broken" footer
  if (insightsBlock) {
    recordTelemetry('fallbackResponses', 'insights-without-llm')
    return {
      success: true,
      message: insightsBlock,
      toolUsed: 'insights',
      suggestions: [
        'What makes those values unusual?',
        'Analyze my data for patterns',
      ],
    }
  }

  recordTelemetry('fallbackResponses', 'ai-server-unavailable')
  return {
    success: false,
    message: 'I couldn\'t reach the AI service just now. Please try again in a moment.',
    toolUsed: 'fallback',
    suggestions: ['Try your question again', 'Explain this spreadsheet I just loaded'],
  }
}
