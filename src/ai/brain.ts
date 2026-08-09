/**
 * brain.ts — Legacy orchestrator, transitioning to utility module.
 *
 * ARCHITECTURE NOTE (Intent Engine NLP Refactor):
 * This file previously served as the central orchestrator for chat processing.
 * Its responsibilities are being migrated to the unified pipeline:
 *
 * - `runDeterministicSkills()` → replaced by `src/ai/pipeline/stages/deterministicDispatcher.ts`
 * - LLM gateway logic → replaced by `src/ai/pipeline/stages/llmGateway.ts`
 * - `processMessage()` → replaced by the PipelineRouter in `src/ai/pipeline/router.ts`
 *
 * CURRENT STATUS:
 * - `processMessage()` is still called by `brainDispatcher.ts` (the active pipeline terminal stage).
 * - Once `chatService.ts` is rewired to use the split DeterministicDispatcher + LLMGateway stages
 *   directly, `processMessage()` and `runDeterministicSkills()` can be deleted.
 * - Utility functions (buildWorkbookContext, buildDataAwarenessResponse, formatMacroPlanForDisplay,
 *   handleMacroPlan) remain as shared helpers for macro planning (deferred feature).
 *
 * @deprecated This module's orchestration role is superseded by the pipeline stages.
 *   New features should NOT add logic here. Use the pipeline stages instead.
 */

import { parseUserIntent, isQueryIntent } from '@shared/intentParser'
import { classifyMode, isBudgetExplainQuery, isLlmOnlyMode } from '@/ai/mode'
import { resolveAnalysisTarget, type AnalysisTarget } from '@/ai/analysisTarget'
import { buildSheetProfile } from '@/ai/sheetProfile'
import { analyzeBudget, budgetAnalysisToToolResult, savingsRecommendation } from '@/ai/analysis/budget'
import { generateReport } from '@/ai/analysis/reporting'
import { runCleaningSkill } from '@/ai/analysis/cleaning'
import { runQueryFromIntent } from '@/ai/queryEngine'
import { queryComparison } from '@/ai/comparison'
import { formatInsights, explainOutliers, mergeToolResultContent, toolResultToMessage } from '@/ai/responseBuilder'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import { recordTelemetry } from '@/ai/telemetry'
import { runAudit, formatAuditForContext } from '@/auditor'
import { getContextualSuggestions } from '@/ai/contextualSuggestions'
import type { SheetInsights } from '@/ai/sheetInsights'
import { isOutlierFollowUp } from '@/ai/outliers'
import type { AttachedFilePreview, ToolResult } from '@/ai/types'
import type { Selection, SheetData, WorkbookData } from '@/types'
import { planMacro } from '@/ai/nlp/macroPlanner'
import { createMacroPlanManager } from '@/ai/macro/macroPlanManager'
import type { MacroPlan, MacroExecutionResult, WorkbookContext, UndoManager } from '@/ai/nlp/types'
import type { IntentType } from '@shared/intentTypes'

export interface ProcessMessageInput {
  message: string
  workbook: WorkbookData
  sheet: SheetData
  selection: Selection | null
  getComputedValue: (row: number, col: number) => string
  getSheetComputedValue?: (sheetId: string, row: number, col: number) => string
  attachedPreview?: AttachedFilePreview | null
  priorInsights?: SheetInsights | null
  userPreferences?: Record<string, string>
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  onToken?: (token: string) => void
  /** Undo manager for transactional macro execution */
  undoManager?: UndoManager
  /** Macro plan UI callbacks — required for multi-step plan presentation */
  macroPlanCallbacks?: MacroPlanUICallbacks
}

// ─── Macro Plan UI Callbacks ────────────────────────────────────────────────

/**
 * User-facing callbacks for the macro plan confirmation flow.
 * The Brain uses these to present plans and await user decisions.
 */
export interface MacroPlanUICallbacks {
  /** Present the numbered plan and return the user's decision */
  presentPlan(planDisplay: string, plan: MacroPlan): Promise<MacroPlanUserDecision>
  /** Display execution progress */
  onProgress?(current: number, total: number): void
  /** Display completion summary */
  onComplete?(result: MacroExecutionResult): void
  /** Display error with retry/cancel options, return user decision */
  onError(message: string): Promise<'retry' | 'cancel'>
}

export type MacroPlanUserDecision =
  | { action: 'confirm' }
  | { action: 'reject' }
  | { action: 'edit'; stepIndex: number; newParams: Record<string, unknown> }

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

/**
 * @deprecated Use `createDeterministicDispatcherStage()` from
 * `src/ai/pipeline/stages/deterministicDispatcher.ts` instead.
 * This function is only retained because `processMessage()` still calls it
 * via the brainDispatcher stage. It will be removed once chatService.ts
 * is fully rewired to use the split pipeline stages.
 * @internal
 */
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

  // ─── Long-term Memory (User Preferences) ──────────────────────────────────
  if (message.toLowerCase().includes('remember') || message.toLowerCase().includes('my preference')) {
    const prefMatch = message.match(/remember that I (?:like|prefer) (.*?)(?: for|$)/i) || 
                     message.match(/my preference is (.*?)(?: for|$)/i)
    if (prefMatch) {
      const pref = prefMatch[1].trim()
      return withTool({
        success: true,
        message: `I've noted that preference: "${pref}". I'll keep it in mind for future operations.`,
        actions: [{ tool: 'save_preference', params: { preference: pref }, description: 'Save user preference' }]
      }, 'preference-save')
    }
  }

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

  if (intent.intentType === 'compare') {
    return withTool(queryComparison(
      target.workbook,
      target.sheet,
      message,
      target.getSheetComputedValue,
    ), 'comparison')
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

/**
 * @deprecated Superseded by `buildSummary()` in `src/ai/pipeline/stages/llmGateway.ts`.
 * Retained only for the legacy processMessage() path.
 */
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

// ─── Macro Plan Integration Helpers ─────────────────────────────────────────
// These utility functions are part of brain.ts's role as a utility module.
// They support macro planning (deferred feature) and remain for future use.

/** Intent types that the macro planner can decompose */
const MACRO_INTENT_VOCABULARY: IntentType[] = [
  'read', 'analyze', 'write', 'format', 'create_chart', 'create_formula',
  'summarize', 'filter', 'sort', 'clean', 'budget', 'report', 'compare',
  'find', 'calculate', 'export',
]

/** Maximum time to generate and present a macro plan (ms) */
const MACRO_PLAN_DEADLINE_MS = 500

/**
 * Convert WorkbookData (app domain) to WorkbookContext (NLP domain)
 * for entity resolution and macro planning.
 *
 * This is a shared utility function — part of brain.ts's role as a utility module.
 */
export function buildWorkbookContext(workbook: WorkbookData, sheet: SheetData, getComputedValue: (row: number, col: number) => string): WorkbookContext {
  const sheets = workbook.sheets.map((s) => {
    // Extract column headers from the first row
    const columns: Array<{ letter: string; headerName: string; index: number }> = []
    // Detect columns from cell data (check first row for headers)
    const colCount = Object.keys(s.columnWidths).length || 26 // default 26 cols
    for (let col = 0; col < colCount; col++) {
      const letter = String.fromCharCode(65 + col) // A, B, C, ...
      let headerName: string
      // If this is the active sheet, use getComputedValue for the header row
      if (s.id === sheet.id) {
        headerName = getComputedValue(0, col)
      } else {
        // For other sheets, read raw cell data from row 0
        const cellKey = `${0},${col}`
        const cell = s.cells[cellKey]
        headerName = cell?.value?.toString() ?? ''
      }
      if (headerName) {
        columns.push({ letter, headerName, index: col })
      }
    }
    return {
      id: s.id,
      name: s.name,
      columns,
    }
  })

  return {
    activeSheetId: workbook.activeSheetId,
    sheets,
  }
}

/**
 * Attempt macro planning for a user message.
 * Returns a MacroPlan if the message is a multi-step or single-step actionable command.
 * Returns null if planning fails or the message doesn't decompose into actions.
 *
 * This is a shared utility function — part of brain.ts's role as a utility module.
 */
export function tryPlanMacro(
  message: string,
  workbookContext: WorkbookContext,
): MacroPlan | null {
  try {
    const plan = planMacro(message, workbookContext, MACRO_INTENT_VOCABULARY)
    // Only handle plans with at least 1 step
    if (plan.steps.length === 0) return null
    return plan
  } catch {
    return null
  }
}

/**
 * Format a MacroPlan as a numbered list of descriptions for display.
 * Each step is presented as "{n}. {description}".
 *
 * This is a shared utility function — part of brain.ts's role as a utility module.
 */
export function formatMacroPlanForDisplay(plan: MacroPlan): string {
  return plan.steps
    .map((step, index) => `${index + 1}. ${step.description}`)
    .join('\n')
}

/**
 * Execute a macro plan through the Brain's UI flow.
 *
 * Flow:
 * - Single-step plan → execute directly without confirmation (Req 6.6)
 * - Multi-step plan → present numbered list → await user decision (Req 6.1)
 *   - confirm → execute (Req 6.3)
 *   - reject → cancel (Req 6.4)
 *   - edit → update step params, re-present (Req 6.5)
 * - On error → display error with retry/cancel (Req 6.7)
 *
 * Returns a ToolResult describing what happened, or null if not applicable.
 */
async function handleMacroPlan(
  plan: MacroPlan,
  input: ProcessMessageInput,
  _workbookContext: WorkbookContext,
): Promise<ToolResult | null> {
  const { undoManager, macroPlanCallbacks } = input

  // Can't run macros without an undo manager
  if (!undoManager) {
    return null
  }

  // Single-step plan → execute directly without confirmation (Req 6.6)
  if (plan.steps.length === 1) {
    const manager = createMacroPlanManager({
      presentPlan() { /* no-op for single step */ },
      showProgress(current, total) { macroPlanCallbacks?.onProgress?.(current, total) },
      showSummary(result) { macroPlanCallbacks?.onComplete?.(result) },
      showError() { /* handled below */ },
      isConfirmed: () => true,
      isRejected: () => false,
      shouldCancel: () => false,
    })

    try {
      const result = await manager.processPlan(plan, undoManager)
      if (result && result.success) {
        const step = plan.steps[0]
        recordTelemetry('macroExecution', 'single-step-success')
        return {
          success: true,
          message: `Executed: ${step.description}`,
          toolUsed: 'macro',
          actions: [{ tool: step.tool, params: step.params, description: step.description }],
        }
      }
      if (result && !result.success && result.failedStep) {
        return {
          success: false,
          message: `Step failed: ${result.failedStep.reason}`,
          toolUsed: 'macro',
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        message: `Macro execution failed: ${errMsg}`,
        toolUsed: 'macro',
      }
    }
    return null
  }

  // Multi-step plan → present for confirmation (Req 6.1)
  if (!macroPlanCallbacks) {
    // No UI callbacks available — can't present plan, fall through to normal flow
    return null
  }

  let currentPlan = plan
  const startTime = Date.now()

  // Loop to handle edit → re-present cycles
  while (true) {
    const planDisplay = formatMacroPlanForDisplay(currentPlan)

    // Validate timing: should present within 500ms of plan generation (Req 6.1)
    const elapsed = Date.now() - startTime
    if (elapsed > MACRO_PLAN_DEADLINE_MS) {
      console.warn(`[Brain] Macro plan presentation exceeded ${MACRO_PLAN_DEADLINE_MS}ms deadline (${elapsed}ms)`)
    }

    // Present to user and await decision
    let decision: MacroPlanUserDecision
    try {
      decision = await macroPlanCallbacks.presentPlan(planDisplay, currentPlan)
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Failed to present plan'
      const userChoice = await macroPlanCallbacks.onError(errMsg)
      if (userChoice === 'retry') {
        continue // re-present
      }
      // cancel
      recordTelemetry('macroExecution', 'cancelled-on-error')
      return {
        success: false,
        message: 'Macro cancelled.',
        toolUsed: 'macro',
      }
    }

    // Handle user decision
    if (decision.action === 'reject') {
      // User rejected → cancel (Req 6.4)
      recordTelemetry('macroExecution', 'rejected')
      return {
        success: true,
        message: 'Macro plan cancelled.',
        toolUsed: 'macro',
      }
    }

    if (decision.action === 'edit') {
      // User edited a step → update params and re-present (Req 6.5)
      const { stepIndex, newParams } = decision
      if (stepIndex >= 0 && stepIndex < currentPlan.steps.length) {
        const updatedSteps = currentPlan.steps.map((step, i) =>
          i === stepIndex ? { ...step, params: { ...step.params, ...newParams } } : step
        )
        currentPlan = { ...currentPlan, steps: updatedSteps }
      }
      continue // re-present the edited plan
    }

    // decision.action === 'confirm' → execute (Req 6.3)
    try {
      const cancelled = false
      const manager = createMacroPlanManager({
        presentPlan() { /* already presented */ },
        showProgress(current, total) { macroPlanCallbacks.onProgress?.(current, total) },
        showSummary(result) { macroPlanCallbacks.onComplete?.(result) },
        showError() { /* handled via try/catch */ },
        isConfirmed: () => true, // already confirmed
        isRejected: () => false,
        shouldCancel: () => cancelled,
      })

      const result = await manager.processPlan(currentPlan, undoManager)

      if (result && result.success) {
        recordTelemetry('macroExecution', 'multi-step-success')
        const summary = result.completedSteps
          .map((s, i) => `${i + 1}. ✓ ${s.step.description}`)
          .join('\n')
        return {
          success: true,
          message: `Macro completed successfully:\n${summary}`,
          toolUsed: 'macro',
          actions: result.completedSteps.map((s) => ({
            tool: s.step.tool,
            params: s.step.params,
            description: s.step.description,
          })),
        }
      }

      if (result && !result.success && result.failedStep) {
        const { index, step, reason } = result.failedStep
        recordTelemetry('macroExecution', 'step-failed')
        return {
          success: false,
          message: `Macro failed at step ${index + 1} (${step.tool}): ${reason}. All changes have been rolled back.`,
          toolUsed: 'macro',
        }
      }

      // Null result means it was cancelled mid-way
      return {
        success: true,
        message: 'Macro plan cancelled.',
        toolUsed: 'macro',
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error during macro execution'
      recordTelemetry('macroExecution', 'execution-error')
      const userChoice = await macroPlanCallbacks.onError(errMsg)
      if (userChoice === 'retry') {
        continue // re-present and retry
      }
      return {
        success: false,
        message: `Macro execution failed: ${errMsg}`,
        toolUsed: 'macro',
      }
    }
  }
}

/**
 * @deprecated Use the PipelineRouter with split stages (DeterministicDispatcher + LLMGateway)
 * instead of calling processMessage() directly. This function is retained only as the
 * implementation behind `brainDispatcher.ts` until chatService.ts adopts the split stages.
 *
 * Once the migration is complete, this function and `runDeterministicSkills()` will be removed,
 * and brain.ts will become a pure utility module (macro planning helpers only).
 */
export async function processMessage(input: ProcessMessageInput): Promise<ToolResult> {
  const mode = classifyMode(input.message)
  const intent = parseUserIntent(input.message)
  const target = resolveAnalysisTarget(input)

  // ─── Macro Plan Detection ───────────────────────────────────────────────────
  // Attempt macro planning for commands that might be multi-step.
  // Only run if the intent isn't something that fully handled locally (like outlier follow-up).
  if (input.undoManager && !isOutlierFollowUp(input.message)) {
    const workbookContext = buildWorkbookContext(input.workbook, input.sheet, input.getComputedValue)
    const plan = tryPlanMacro(input.message, workbookContext)

    // Multi-step plans (>1 step) always go through macro flow
    // Single-step plans go through macro flow only when macro callbacks are available
    if (plan && (plan.steps.length > 1 || (plan.steps.length === 1 && input.macroPlanCallbacks))) {
      const macroResult = await handleMacroPlan(plan, input, workbookContext)
      if (macroResult) {
        return macroResult
      }
    }
  }

  const deterministic = runDeterministicSkills(
    target,
    input.workbook.name,
    input.message,
    mode,
    intent,
    input.priorInsights,
  )
  const deterministicText = deterministic ? toolResultToMessage(deterministic, { includeSuggestionsInBody: false }) : ''

  // Deterministic queries that fully answer (or precisely clarify) the request
  // should not be diluted by a second, potentially contradictory LLM answer.
  if (deterministic?.toolUsed === 'outlier-explain' || deterministic?.toolUsed === 'comparison') {
    recordTelemetry('deterministicResponses', deterministic.toolUsed)
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
      userPreferences: input.userPreferences,
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
      reasoning: serverResult.reasoning,
      providerMeta: serverResult.meta,
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
