/**
 * DeterministicDispatcher Stage — Routes intents to built-in deterministic skills.
 *
 * Extracted from brain.ts `runDeterministicSkills()`. Dispatches based on
 * `context.intent.intentType` and `context.mode` to execute local skills
 * without requiring an LLM call.
 *
 * Claims when: an intent maps to a built-in skill (clean, report, compare,
 *   budget in act mode, query, outlier follow-up, data awareness)
 * Passes when: no deterministic skill handles the intent, or the question is
 *   advice / an open-ended budget question — then the budget analysis is set on
 *   `context.localAnalysis` for the LLM gateway (returns null)
 *
 * Validates: REQ-6.1, REQ-6.2, REQ-6.3, REQ-6.4
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import { resolveAnalysisTarget, type AnalysisTarget } from '@/ai/analysisTarget'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { ToolResult } from '@/ai/types'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/analysis/budget'
import { generateReport } from '@/ai/analysis/reporting'
import { runCleaningSkill } from '@/ai/analysis/cleaning'
import { runQueryFromIntent } from '@/ai/queryEngine'
import { queryComparison } from '@/ai/comparison'
import { explainOutliers } from '@/ai/responseBuilder'
import { isOutlierFollowUp } from '@/ai/outliers'
import { isQueryIntent } from '@shared/intentParser'
import { isBudgetExplainQuery, isLlmOnlyMode } from '@shared/mode'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a comprehensive "What do I know?" response from live sheet context.
 * Extracted from brain.ts — answers the user's question about what data the AI can see.
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

/**
 * Resolve outliers from current insights or prior insights (for follow-up context).
 */
function resolveOutliersForFollowUp(
  current: SheetInsights,
  prior?: SheetInsights | null,
): NonNullable<SheetInsights['outliers']> {
  if (current.outliers?.length) return current.outliers
  if (prior?.outliers?.length) return prior.outliers
  return []
}

/**
 * Convert a ToolResult from a deterministic skill into a pipeline StageResult.
 */
function toStageResult(result: ToolResult, routingSource?: string): StageResult {
  return {
    success: result.success,
    message: result.message,
    actions: result.actions?.map((a) => ({
      tool: a.tool,
      params: a.params,
      description: a.description,
    })),
    suggestions: result.suggestions,
    stageName: 'deterministic-dispatcher',
    metadata: {
      toolUsed: result.toolUsed,
      routingSource,
    },
  }
}

// ─── Stage Factory ───────────────────────────────────────────────────────────

/**
 * Creates the DeterministicDispatcher pipeline stage.
 *
 * When `target` is omitted, resolves the analysis target from PipelineContext
 * (production chatService path). Tests may still pass an explicit target.
 */
export function createDeterministicDispatcherStage(
  target?: AnalysisTarget,
  workbookName?: string,
  priorInsights?: SheetInsights | null,
): PipelineStage {
  return {
    name: 'deterministic-dispatcher',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const intent = context.intent
      const mode = context.mode
      const message = context.message

      // If IntentClassifier hasn't enriched context, we can't dispatch
      if (!intent || !mode) return null

      const resolvedTarget = target ?? resolveAnalysisTarget({
        workbook: context.workbook,
        sheet: context.sheet,
        selection: context.selection,
        getComputedValue: context.getComputedValue,
        getSheetComputedValue: context.getSheetComputedValue,
        attachedPreview: context.attachedPreview,
      })
      const resolvedWorkbookName = workbookName ?? resolvedTarget.workbookName
      const resolvedPrior = priorInsights !== undefined ? priorInsights : context.priorInsights

      const profile = buildSheetProfile(resolvedTarget.sheet, resolvedTarget.getComputedValue)
      const insights = resolvedTarget.context.insights

      // ─── Outlier Follow-Up ──────────────────────────────────────────────────
      if (isOutlierFollowUp(message)) {
        const outliers = resolveOutliersForFollowUp(insights, resolvedPrior)
        const result: ToolResult = {
          success: true,
          message: explainOutliers(outliers),
          toolUsed: 'outlier-explain',
          suggestions: outliers.length
            ? [
                'Check those rows for typos or missing decimals',
                'Filter to only the flagged rows',
                'Explain this spreadsheet I just loaded',
              ]
            : ['Analyze my data for patterns', 'Explain this spreadsheet I just loaded'],
        }
        return toStageResult(result, intent?.routingSource)
      }

      // ─── Data Awareness ─────────────────────────────────────────────────────
      const lower = message.toLowerCase()
      if (lower.includes('what do you know') || lower.includes('what context') || lower.includes('what data do you')) {
        const result: ToolResult = {
          success: true,
          message: buildDataAwarenessResponse(profile, insights, resolvedWorkbookName, resolvedTarget),
          toolUsed: 'data-awareness',
        }
        return toStageResult(result, intent?.routingSource)
      }

      // ─── Clean ──────────────────────────────────────────────────────────────
      if (intent.intentType === 'clean') {
        return toStageResult({ ...runCleaningSkill(resolvedTarget.sheet), toolUsed: 'cleaning' }, intent?.routingSource)
      }

      // ─── Report ─────────────────────────────────────────────────────────────
      if (intent.intentType === 'report') {
        return toStageResult({ ...generateReport(profile, insights, resolvedWorkbookName), toolUsed: 'reporting' }, intent?.routingSource)
      }

      // ─── Compare ────────────────────────────────────────────────────────────
      if (intent.intentType === 'compare') {
        return toStageResult({
          ...queryComparison(resolvedTarget.workbook, resolvedTarget.sheet, message, resolvedTarget.getSheetComputedValue),
          toolUsed: 'comparison',
        }, intent?.routingSource)
      }

      const isBudgetQuestion = mode === 'advise' || intent.intentType === 'budget'
      const isBudgetExplain = mode === 'explain' && profile.detectedPurpose === 'budget' && isBudgetExplainQuery(message)
      const runBudgetSkill = (): ToolResult => {
        const monthlyIncome = typeof intent.parameters.monthlyIncome === 'number'
          ? intent.parameters.monthlyIncome
          : insights.totalIncome
        if (isBudgetQuestion && monthlyIncome && monthlyIncome > 0) {
          return { ...savingsRecommendation(monthlyIncome, insights), toolUsed: 'budget' }
        }
        return { ...budgetAnalysisToToolResult(analyzeBudget(profile, insights)), toolUsed: 'budget' }
      }

      // ─── Advice / open-ended budget questions ───────────────────────────────
      // These need judgment, so the local analysis becomes model context rather
      // than the whole answer. Advice skips the query engine: keyword hits like
      // "where" or "biggest" would otherwise turn "where am I overspending?"
      // into a top-N listing.
      if (mode === 'advise' || ((isBudgetQuestion || isBudgetExplain) && isLlmOnlyMode(mode) && !isQueryIntent(intent))) {
        const result = runBudgetSkill()
        context.localAnalysis = { message: result.message, suggestions: result.suggestions, toolUsed: 'budget' }
        return null
      }

      // ─── Query ──────────────────────────────────────────────────────────────
      if (isQueryIntent(intent)) {
        const queryResult = runQueryFromIntent(resolvedTarget.sheet, intent, resolvedTarget.getComputedValue, insights)
        return queryResult ? toStageResult({ ...queryResult, toolUsed: 'query' }, intent?.routingSource) : null
      }

      // ─── Budget (act mode) ──────────────────────────────────────────────────
      if (isBudgetQuestion || isBudgetExplain) {
        return toStageResult(runBudgetSkill(), intent?.routingSource)
      }

      // ─── No deterministic skill matched — pass to next stage ────────────────
      return null
    },
  }
}
