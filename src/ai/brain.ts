import { parseUserIntent, isQueryIntent } from '@/ai/intentParser'
import { classifyMode, isBudgetExplainQuery, isLlmOnlyMode } from '@/ai/mode'
import { resolveAnalysisTarget, type AnalysisTarget } from '@/ai/analysisTarget'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/analysis/budget'
import { generateReport } from '@/ai/analysis/reporting'
import { runCleaningSkill } from '@/ai/analysis/cleaning'
import { runQueryFromIntent } from '@/ai/queryEngine'
import { formatInsights, explainOutliers, mergeToolResultContent, toolResultToMessage } from '@/ai/responseBuilder'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import { recordTelemetry } from '@/ai/telemetry'
import { runAudit, formatAuditForContext } from '@/auditor'
import { getContextualSuggestions } from '@/ai/contextualSuggestions'
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

/**
 * Build a comprehensive "What do I know?" response from live sheet context.
 * Answers the user's question about what data the AI can see.
 */
function buildDataAwarenessResponse(
  profile: ReturnType<typeof buildSheetProfile>,
  insights: SheetInsights,
  workbookName: string,
  target: AnalysisTarget,
): string {
  const lines: string[] = ['### What I can see about your data\n']

  lines.push(`**Workbook:** ${workbookName}`)
  lines.push(`**Active sheet:** ${profile.name} (${profile.rowCount} rows × ${profile.colCount} cols)`)
  lines.push(`**Detected purpose:** ${profile.detectedPurpose}`)

  if (insights.headers.length > 0) {
    lines.push(`\n**Columns I found:** ${insights.headers.slice(0, 12).join(', ')}${insights.headers.length > 12 ? ` (+${insights.headers.length - 12} more)` : ''}`)
  }

  if (profile.columns.length > 0) {
    const roles = profile.columns
      .filter((c) => c.role !== 'unknown')
      .map((c) => `${c.name} (${c.role})`)
      .slice(0, 8)
    if (roles.length > 0) {
      lines.push(`**Column roles:** ${roles.join(', ')}`)
    }
  }

  if (insights.totalIncome || insights.totalExpenses) {
    lines.push('\n**Financial summary:**')
    if (insights.totalIncome) lines.push(`- Income: $${insights.totalIncome.toLocaleString()}`)
    if (insights.totalExpenses) lines.push(`- Expenses: $${insights.totalExpenses.toLocaleString()}`)
    if (insights.netCashflow !== undefined) lines.push(`- Net: $${insights.netCashflow.toLocaleString()}`)
  }

  if (insights.columnStats.length > 0) {
    const numericCols = insights.columnStats.filter((c) => c.sum !== undefined)
    if (numericCols.length > 0) {
      lines.push(`\n**Numeric columns:** ${numericCols.length} columns with computed stats (sum, avg, min, max)`)
    }
  }

  if (insights.outliers?.length) {
    lines.push(`\n**Flagged values:** ${insights.outliers.length} statistical outlier${insights.outliers.length > 1 ? 's' : ''} detected`)
  }

  if (insights.categoryTotals?.length) {
    lines.push(`**Categories:** ${insights.categoryTotals.length} unique categories tracked`)
  }

  const dataPreviewRows = target.context.sampleRows?.length ?? 0
  lines.push(`\n**Data preview:** I can see ${dataPreviewRows} rows${target.context.sampleRowsTruncated ? ' (truncated — full sheet is larger)' : ''}.`)
  lines.push(`**What I can do:** analyze, audit for errors, answer questions, build formulas, format, create charts, and apply changes you approve.`)

  return lines.join('\n')
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

  // ─── "What do you know about my data?" — data context awareness ─────────────
  const lower = message.toLowerCase()
  if (lower.includes('what do you know') || lower.includes('what context') || lower.includes('what data do you')) {
    return withTool({
      success: true,
      message: buildDataAwarenessResponse(profile, insights, workbookName, target),
    }, 'data-awareness')
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
    // ─── Deduplicate deterministic + LLM responses ────────────────────────────
    // When deterministic text already answered the question well, skip the LLM
    // text if it's just a fallback or a weaker restatement of the same numbers.
    const llmText = serverResult.source === 'fallback'
      && (deterministicText.trim() || insightsBlock.trim())
      ? ''
      : serverResult.message

    // Skip LLM text if it substantially overlaps with deterministic content
    // (the model tends to rephrase the same numbers we already computed)
    const shouldSkipLlm = deterministicText.trim().length > 100
      && llmText.trim().length > 0
      && llmText.trim().length < deterministicText.trim().length * 0.8
      && serverResult.source !== 'llm'
    const finalLlmText = shouldSkipLlm ? '' : llmText

    const combined = mergeToolResultContent([
      deterministicText,
      insightsBlock && !deterministicText.includes('Sheet insights') ? insightsBlock : '',
      finalLlmText,
    ].filter(Boolean))

    if (deterministicText.trim().length > 0 && finalLlmText.trim().length > 0) {
      recordTelemetry('hybridResponses', deterministic?.toolUsed ?? 'hybrid')
    } else if (finalLlmText.trim().length > 0) {
      recordTelemetry('llmResponses', serverResult.source)
    } else {
      recordTelemetry('deterministicResponses', deterministic?.toolUsed ?? 'local-insights')
    }

    // ─── Contextual suggestions based on live sheet state ─────────────────────
    const contextualSuggestions = getContextualSuggestions({
      insights: target.context.insights,
      profile: target.context.profile,
      lastUserMessage: input.message,
      hasMultipleSheets: input.workbook.sheets.length > 1,
      sheetNames: input.workbook.sheets.map((s) => s.name),
    })

    return {
      success: true,
      message: combined || 'I looked at your sheet but didn\'t find enough to go on. Try selecting a range or asking a more specific question.',
      toolUsed: deterministic?.toolUsed ?? (finalLlmText ? 'llm' : 'insights'),
      suggestions: contextualSuggestions.length > 0
        ? contextualSuggestions
        : (deterministic?.suggestions ?? serverResult.suggestions),
      actions: serverResult.actions.map((a) => ({
        tool: a.tool,
        params: a.params,
        description: a.description,
      })),
    }
  }

  if (deterministic) {
    recordTelemetry('deterministicResponses', deterministic.toolUsed ?? 'deterministic')
    // Add contextual suggestions to deterministic responses too
    const contextualSuggestions = getContextualSuggestions({
      insights: target.context.insights,
      profile: target.context.profile,
      lastUserMessage: input.message,
      hasMultipleSheets: input.workbook.sheets.length > 1,
      sheetNames: input.workbook.sheets.map((s) => s.name),
    })
    return {
      ...deterministic,
      suggestions: contextualSuggestions.length > 0
        ? contextualSuggestions
        : deterministic.suggestions,
    }
  }

  // Local insights still useful when the AI server is down — no scary "AI broken" footer
  if (insightsBlock) {
    recordTelemetry('fallbackResponses', 'insights-without-llm')
    const contextualSuggestions = getContextualSuggestions({
      insights: target.context.insights,
      profile: target.context.profile,
      lastUserMessage: input.message,
      hasMultipleSheets: input.workbook.sheets.length > 1,
      sheetNames: input.workbook.sheets.map((s) => s.name),
    })
    return {
      success: true,
      message: insightsBlock,
      toolUsed: 'insights',
      suggestions: contextualSuggestions.length > 0
        ? contextualSuggestions
        : ['What makes those values unusual?', 'Analyze my data for patterns'],
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
