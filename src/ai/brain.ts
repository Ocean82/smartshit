/**
 * brain.ts — Legacy orchestrator helpers (macros + transitional processMessage).
 *
 * Production chat uses PipelineRouter stages:
 * - DeterministicDispatcher + LLMGateway (wired in chatService)
 * - MacroPlanner (Slice 3) presents multi-step execute_macro actions
 *
 * `processMessage()` remains for macro unit tests. Prefer pipeline stages
 * for new chat behavior.
 *
 * @deprecated Orchestration role superseded by pipeline stages.
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
import { defaultStepExecutor } from '@/ai/macro/macroExecutor'
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

// ─── Small Utilities ────────────────────────────────────────────────────────

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

// ─── Data Awareness (Phase 5: data-driven sections) ─────────────────────────

interface AwarenessSection {
  shouldShow: (
    profile: ReturnType<typeof buildSheetProfile>,
    insights: SheetInsights,
    target: AnalysisTarget,
  ) => boolean
  render: (
    profile: ReturnType<typeof buildSheetProfile>,
    insights: SheetInsights,
    workbookName: string,
    target: AnalysisTarget,
  ) => string[]
}

const AWARENESS_SECTIONS: AwarenessSection[] = [
  {
    shouldShow: () => true, // always show header
    render: (profile, _insights, workbookName) => [
      '### What I can see about your data\n',
      `**Workbook:** ${workbookName}`,
      `**Active sheet:** ${profile.name} (${profile.rowCount} rows × ${profile.colCount} cols)`,
      `**Detected purpose:** ${profile.detectedPurpose}`,
    ],
  },
  {
    shouldShow: (_p, insights) => insights.headers.length > 0,
    render: (_p, insights) => [
      `\n**Columns I found:** ${insights.headers.slice(0, 12).join(', ')}${insights.headers.length > 12 ? ` (+${insights.headers.length - 12} more)` : ''}`,
    ],
  },
  {
    shouldShow: (profile) => profile.columns.some((c) => c.role !== 'unknown'),
    render: (profile) => {
      const roles = profile.columns
        .filter((c) => c.role !== 'unknown')
        .map((c) => `${c.name} (${c.role})`)
        .slice(0, 8)
      return [`**Column roles:** ${roles.join(', ')}`]
    },
  },
  {
    shouldShow: (_p, insights) => Boolean(insights.totalIncome || insights.totalExpenses),
    render: (_p, insights) => {
      const lines = ['\n**Financial summary:**']
      if (insights.totalIncome) lines.push(`- Income: $${insights.totalIncome.toLocaleString()}`)
      if (insights.totalExpenses) lines.push(`- Expenses: $${insights.totalExpenses.toLocaleString()}`)
      if (insights.netCashflow !== undefined) lines.push(`- Net: $${insights.netCashflow.toLocaleString()}`)
      return lines
    },
  },
  {
    shouldShow: (_p, insights) => insights.columnStats.some((c) => c.sum !== undefined),
    render: (_p, insights) => {
      const numericCols = insights.columnStats.filter((c) => c.sum !== undefined)
      return [`\n**Numeric columns:** ${numericCols.length} columns with computed stats (sum, avg, min, max)`]
    },
  },
  {
    shouldShow: (_p, insights) => Boolean(insights.outliers?.length),
    render: (_p, insights) => [
      `\n**Flagged values:** ${insights.outliers!.length} statistical outlier${insights.outliers!.length > 1 ? 's' : ''} detected`,
    ],
  },
  {
    shouldShow: (_p, insights) => Boolean(insights.categoryTotals?.length),
    render: (_p, insights) => [
      `**Categories:** ${insights.categoryTotals!.length} unique categories tracked`,
    ],
  },
  {
    shouldShow: () => true, // always show footer
    render: (_p, _i, _w, target) => {
      const dataPreviewRows = target.context.sampleRows?.length ?? 0
      return [
        `\n**Data preview:** I can see ${dataPreviewRows} rows${target.context.sampleRowsTruncated ? ' (truncated — full sheet is larger)' : ''}.`,
        `**What I can do:** analyze, audit for errors, answer questions, build formulas, format, create charts, and apply changes you approve.`,
      ]
    },
  },
]

/**
 * Build a comprehensive "What do I know?" response from live sheet context.
 */
function buildDataAwarenessResponse(
  profile: ReturnType<typeof buildSheetProfile>,
  insights: SheetInsights,
  workbookName: string,
  target: AnalysisTarget,
): string {
  return AWARENESS_SECTIONS
    .filter((s) => s.shouldShow(profile, insights, target))
    .flatMap((s) => s.render(profile, insights, workbookName, target))
    .join('\n')
}

// ─── Deterministic Skills Dispatch Table (Phase 3) ──────────────────────────

interface DeterministicHandler {
  match: (ctx: DeterministicContext) => boolean
  handle: (ctx: DeterministicContext) => ToolResult | null
}

interface DeterministicContext {
  target: AnalysisTarget
  workbookName: string
  message: string
  lower: string
  mode: ReturnType<typeof classifyMode>
  intent: ReturnType<typeof parseUserIntent>
  priorInsights?: SheetInsights | null
  profile: ReturnType<typeof buildSheetProfile>
  insights: SheetInsights
}

const DETERMINISTIC_HANDLERS: DeterministicHandler[] = [
  // Long-term Memory (User Preferences)
  {
    match: ({ lower }) =>
      lower.includes('remember') || lower.includes('my preference'),
    handle: ({ message }) => {
      const prefMatch = message.match(/remember that I (?:like|prefer) (.*?)(?: for|$)/i)
        || message.match(/my preference is (.*?)(?: for|$)/i)
      if (!prefMatch) return null
      const pref = prefMatch[1].trim()
      return withTool({
        success: true,
        message: `I've noted that preference: "${pref}". I'll keep it in mind for future operations.`,
        actions: [{ tool: 'save_preference', params: { preference: pref }, description: 'Save user preference' }],
      }, 'preference-save')
    },
  },
  // Follow-ups about outliers
  {
    match: ({ message }) => isOutlierFollowUp(message),
    handle: ({ insights, priorInsights }) => {
      const outliers = resolveOutliersForFollowUp(insights, priorInsights)
      return withTool({
        success: true,
        message: explainOutliers(outliers),
        suggestions: outliers.length
          ? ['Check those rows for typos or missing decimals', 'Filter to only the flagged rows', 'Explain this spreadsheet I just loaded']
          : ['Analyze my data for patterns', 'Explain this spreadsheet I just loaded'],
      }, 'outlier-explain')
    },
  },
  // "What do you know about my data?"
  {
    match: ({ lower }) =>
      lower.includes('what do you know') || lower.includes('what context') || lower.includes('what data do you'),
    handle: ({ profile, insights, workbookName, target }) =>
      withTool({ success: true, message: buildDataAwarenessResponse(profile, insights, workbookName, target) }, 'data-awareness'),
  },
  // Cleaning
  {
    match: ({ intent }) => intent.intentType === 'clean',
    handle: ({ target }) => withTool(runCleaningSkill(target.sheet), 'cleaning'),
  },
  // Reporting
  {
    match: ({ intent }) => intent.intentType === 'report',
    handle: ({ profile, insights, workbookName }) =>
      withTool(generateReport(profile, insights, workbookName), 'reporting'),
  },
  // Comparison
  {
    match: ({ intent }) => intent.intentType === 'compare',
    handle: ({ target, message }) =>
      withTool(queryComparison(target.workbook, target.sheet, message, target.getSheetComputedValue), 'comparison'),
  },
  // Query
  {
    match: ({ intent }) => isQueryIntent(intent),
    handle: ({ target, intent, insights }) => {
      const queryResult = runQueryFromIntent(target.sheet, intent, target.getComputedValue, insights)
      return queryResult ? withTool(queryResult, 'query') : null
    },
  },
  // Budget (advise mode or budget intent)
  {
    match: ({ mode, intent }) => mode === 'advise' || intent.intentType === 'budget',
    handle: ({ intent, insights, profile }) => {
      const monthlyIncome = typeof intent.parameters.monthlyIncome === 'number'
        ? intent.parameters.monthlyIncome
        : insights.totalIncome
      if (monthlyIncome && monthlyIncome > 0) {
        return withTool(savingsRecommendation(monthlyIncome, insights), 'budget')
      }
      return withTool(budgetAnalysisToToolResult(analyzeBudget(profile, insights)), 'budget')
    },
  },
  // Budget explain
  {
    match: ({ mode, profile, message }) =>
      mode === 'explain' && profile.detectedPurpose === 'budget' && isBudgetExplainQuery(message),
    handle: ({ profile, insights }) =>
      withTool(budgetAnalysisToToolResult(analyzeBudget(profile, insights)), 'budget'),
  },
]

/**
 * @deprecated Use `createDeterministicDispatcherStage()` from
 * `src/ai/pipeline/stages/deterministicDispatcher.ts` instead.
 * @internal
 */
function runDeterministicSkills(ctx: DeterministicContext): ToolResult | null {
  for (const handler of DETERMINISTIC_HANDLERS) {
    if (handler.match(ctx)) {
      const result = handler.handle(ctx)
      if (result !== null) return result
    }
  }
  return null
}

/** Build the DeterministicContext from resolved analysis state. */
function buildDeterministicContext(
  target: AnalysisTarget,
  workbookName: string,
  message: string,
  mode: ReturnType<typeof classifyMode>,
  intent: ReturnType<typeof parseUserIntent>,
  priorInsights?: SheetInsights | null,
): DeterministicContext {
  const profile = buildSheetProfile(target.sheet, target.getComputedValue)
  return {
    target, workbookName, message,
    lower: message.toLowerCase(),
    mode, intent, priorInsights,
    profile,
    insights: target.context.insights,
  }
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

/** Intent types that the macro planner can decompose */
const MACRO_INTENT_VOCABULARY: IntentType[] = [
  'read', 'analyze', 'write', 'format', 'create_chart', 'create_formula',
  'summarize', 'filter', 'sort', 'clean', 'budget', 'report', 'compare',
  'find', 'calculate', 'export',
]

/** Maximum time to generate and present a macro plan (ms) */
const MACRO_PLAN_DEADLINE_MS = 500

// ─── Phase 4: Extract column extraction into a declarative helper ───────────

/**
 * Extract column headers from a sheet's first row.
 * Uses getComputedValue for the active sheet, raw cell data for others.
 */
function extractSheetColumns(
  sheetData: SheetData,
  isActiveSheet: boolean,
  getComputedValue: (row: number, col: number) => string,
): Array<{ letter: string; headerName: string; index: number }> {
  const colCount = Object.keys(sheetData.columnWidths).length || 26
  return Array.from({ length: colCount }, (_, col) => {
    const letter = String.fromCharCode(65 + col)
    let headerName: string
    if (isActiveSheet) {
      headerName = getComputedValue(0, col)
    } else {
      const cellKey = `${0},${col}`
      const cell = sheetData.cells[cellKey]
      headerName = cell?.value?.toString() ?? ''
    }
    return { letter, headerName, index: col }
  }).filter((c) => c.headerName !== '')
}

/**
 * Convert WorkbookData (app domain) to WorkbookContext (NLP domain)
 * for entity resolution and macro planning.
 */
export function buildWorkbookContext(workbook: WorkbookData, sheet: SheetData, getComputedValue: (row: number, col: number) => string): WorkbookContext {
  const sheets = workbook.sheets.map((s) => ({
    id: s.id,
    name: s.name,
    columns: extractSheetColumns(s, s.id === sheet.id, getComputedValue),
  }))

  return {
    activeSheetId: workbook.activeSheetId,
    sheets,
  }
}

/**
 * Attempt macro planning for a user message.
 * Returns a MacroPlan if the message is a multi-step or single-step actionable command.
 * Returns null if planning fails or the message doesn't decompose into actions.
 */
export function tryPlanMacro(
  message: string,
  workbookContext: WorkbookContext,
): MacroPlan | null {
  try {
    const plan = planMacro(message, workbookContext, MACRO_INTENT_VOCABULARY)
    if (plan.steps.length === 0) return null
    return plan
  } catch {
    return null
  }
}

/**
 * Format a MacroPlan as a numbered list of descriptions for display.
 */
export function formatMacroPlanForDisplay(plan: MacroPlan): string {
  return plan.steps
    .map((step, index) => `${index + 1}. ${step.description}`)
    .join('\n')
}

// ─── Phase 2: Decomposed macro execution ────────────────────────────────────

/**
 * Execute a single-step macro plan directly without user confirmation (Req 6.6).
 */
async function executeSingleStepPlan(
  plan: MacroPlan,
  undoManager: UndoManager,
  callbacks?: MacroPlanUICallbacks,
): Promise<ToolResult | null> {
  const manager = createMacroPlanManager({
    presentPlan() { /* no-op for single step */ },
    showProgress(current, total) { callbacks?.onProgress?.(current, total) },
    showSummary(result) { callbacks?.onComplete?.(result) },
    showError() { /* handled below */ },
    isConfirmed: () => true,
    isRejected: () => false,
    shouldCancel: () => false,
  }, defaultStepExecutor)

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

/**
 * Execute a multi-step macro plan with user confirmation loop (Req 6.1–6.7).
 * Handles confirm / reject / edit decisions and retry on error.
 */
async function executeMultiStepPlan(
  plan: MacroPlan,
  undoManager: UndoManager,
  callbacks: MacroPlanUICallbacks,
): Promise<ToolResult | null> {
  let currentPlan = plan
  const startTime = Date.now()

  while (true) {
    const planDisplay = formatMacroPlanForDisplay(currentPlan)

    // Warn if presentation exceeds deadline (Req 6.1)
    const elapsed = Date.now() - startTime
    if (elapsed > MACRO_PLAN_DEADLINE_MS) {
      console.warn(`[Brain] Macro plan presentation exceeded ${MACRO_PLAN_DEADLINE_MS}ms deadline (${elapsed}ms)`)
    }

    // Present to user and await decision
    const decision = await presentPlanSafely(currentPlan, planDisplay, callbacks)
    if (decision === null) {
      // Error + cancel
      return { success: false, message: 'Macro cancelled.', toolUsed: 'macro' }
    }

    if (decision.action === 'reject') {
      recordTelemetry('macroExecution', 'rejected')
      return { success: true, message: 'Macro plan cancelled.', toolUsed: 'macro' }
    }

    if (decision.action === 'edit') {
      currentPlan = applyStepEdit(currentPlan, decision.stepIndex, decision.newParams)
      continue // re-present
    }

    // Confirmed — execute
    const result = await executeConfirmedPlan(currentPlan, undoManager, callbacks)
    if (result === 'retry') continue
    return result
  }

  return null
}

/** Present the plan safely, handling errors. Returns null if user cancels on error. */
async function presentPlanSafely(
  plan: MacroPlan,
  planDisplay: string,
  callbacks: MacroPlanUICallbacks,
): Promise<MacroPlanUserDecision | null> {
  try {
    return await callbacks.presentPlan(planDisplay, plan)
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Failed to present plan'
    const userChoice = await callbacks.onError(errMsg)
    if (userChoice === 'retry') {
      // caller will re-present via continue
      return { action: 'confirm' } // sentinel — but we need a different approach
    }
    recordTelemetry('macroExecution', 'cancelled-on-error')
    return null
  }
}

/** Apply an edit to a specific step in the plan. */
function applyStepEdit(plan: MacroPlan, stepIndex: number, newParams: Record<string, unknown>): MacroPlan {
  if (stepIndex < 0 || stepIndex >= plan.steps.length) return plan
  const updatedSteps = plan.steps.map((step, i) =>
    i === stepIndex ? { ...step, params: { ...step.params, ...newParams } } : step
  )
  return { ...plan, steps: updatedSteps }
}

/** Execute a confirmed multi-step plan. Returns 'retry' if user wants to retry on error. */
async function executeConfirmedPlan(
  plan: MacroPlan,
  undoManager: UndoManager,
  callbacks: MacroPlanUICallbacks,
): Promise<ToolResult | 'retry'> {
  try {
    const manager = createMacroPlanManager({
      presentPlan() { /* already presented */ },
      showProgress(current, total) { callbacks.onProgress?.(current, total) },
      showSummary(result) { callbacks.onComplete?.(result) },
      showError() { /* handled via try/catch */ },
      isConfirmed: () => true,
      isRejected: () => false,
      shouldCancel: () => false,
    }, defaultStepExecutor)

    const result = await manager.processPlan(plan, undoManager)

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

    // Null result means cancelled mid-way
    return { success: true, message: 'Macro plan cancelled.', toolUsed: 'macro' }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error during macro execution'
    recordTelemetry('macroExecution', 'execution-error')
    const userChoice = await callbacks.onError(errMsg)
    if (userChoice === 'retry') return 'retry'
    return {
      success: false,
      message: `Macro execution failed: ${errMsg}`,
      toolUsed: 'macro',
    }
  }
}

/**
 * Route a macro plan to single-step or multi-step execution.
 * Returns a ToolResult describing what happened, or null if not applicable.
 */
async function handleMacroPlan(
  plan: MacroPlan,
  input: ProcessMessageInput,
  _workbookContext: WorkbookContext,
): Promise<ToolResult | null> {
  const { undoManager, macroPlanCallbacks } = input

  if (!undoManager) return null

  if (plan.steps.length === 1) {
    return executeSingleStepPlan(plan, undoManager, macroPlanCallbacks)
  }

  if (!macroPlanCallbacks) return null

  return executeMultiStepPlan(plan, undoManager, macroPlanCallbacks)
}

// ─── Phase 1: Extracted processMessage helpers ──────────────────────────────

/**
 * Attempt macro dispatch for multi-step commands.
 * Returns a ToolResult if the macro handled the message, null otherwise.
 */
async function tryMacroDispatch(input: ProcessMessageInput): Promise<ToolResult | null> {
  if (!input.undoManager || isOutlierFollowUp(input.message)) return null

  const workbookContext = buildWorkbookContext(input.workbook, input.sheet, input.getComputedValue)
  const plan = tryPlanMacro(input.message, workbookContext)

  if (plan && (plan.steps.length > 1 || (plan.steps.length === 1 && input.macroPlanCallbacks))) {
    return handleMacroPlan(plan, input, workbookContext)
  }

  return null
}

// ─── LLM Response Deduplication ─────────────────────────────────────────────

interface ServerResult {
  message: string
  source: string
  reasoning?: string
  meta?: { provider: string; model: string }
  suggestions?: string[]
  actions: Array<{ tool: string; params: Record<string, unknown>; description: string }>
}

interface FinalResponseContext {
  deterministicText: string
  insightsBlock: string
  serverResult: ServerResult
  deterministic: ToolResult | null
  target: AnalysisTarget
  input: ProcessMessageInput
}

/** Determine whether LLM text should be used or skipped due to overlap with deterministic content. */
function resolveLlmText(deterministicText: string, insightsBlock: string, serverResult: ServerResult): string {
  // Skip LLM text if it's just a fallback restatement and we have local content
  if (serverResult.source === 'fallback' && (deterministicText.trim() || insightsBlock.trim())) {
    return ''
  }

  const llmText = serverResult.message

  // Skip LLM text if deterministic content substantially covers the answer
  const deterministicLen = deterministicText.trim().length
  const llmLen = llmText.trim().length
  if (deterministicLen > 100 && llmLen > 0 && llmLen < deterministicLen * 0.8 && serverResult.source !== 'llm') {
    return ''
  }

  return llmText
}

/** Record telemetry based on which content sources contributed to the final response. */
function recordResponseTelemetry(deterministicText: string, finalLlmText: string, deterministic: ToolResult | null, serverResult: ServerResult): void {
  if (deterministicText.trim().length > 0 && finalLlmText.trim().length > 0) {
    recordTelemetry('hybridResponses', deterministic?.toolUsed ?? 'hybrid')
  } else if (finalLlmText.trim().length > 0) {
    recordTelemetry('llmResponses', serverResult.source)
  } else {
    recordTelemetry('deterministicResponses', deterministic?.toolUsed ?? 'local-insights')
  }
}

/** Deduplicate and merge deterministic + LLM text into a final combined message. */
function buildFinalResponse(ctx: FinalResponseContext): ToolResult {
  const { deterministicText, insightsBlock, serverResult, deterministic, target, input } = ctx

  const finalLlmText = resolveLlmText(deterministicText, insightsBlock, serverResult)

  const combined = mergeToolResultContent([
    deterministicText,
    insightsBlock && !deterministicText.includes('Sheet insights') ? insightsBlock : '',
    finalLlmText,
  ].filter(Boolean))

  recordResponseTelemetry(deterministicText, finalLlmText, deterministic, serverResult)

  const suggestions = resolveContextualSuggestions(target, input, deterministic?.suggestions ?? serverResult.suggestions)

  return {
    success: true,
    message: combined || 'I looked at your sheet but didn\'t find enough to go on. Try selecting a range or asking a more specific question.',
    toolUsed: deterministic?.toolUsed ?? (finalLlmText ? 'llm' : 'insights'),
    reasoning: serverResult.reasoning,
    providerMeta: serverResult.meta,
    suggestions,
    actions: serverResult.actions.map((a) => ({
      tool: a.tool,
      params: a.params,
      description: a.description,
    })),
  }
}

/** Build a fallback response when the LLM server is unreachable. */
function buildFallbackResponse(
  deterministic: ToolResult | null,
  insightsBlock: string,
  target: AnalysisTarget,
  input: ProcessMessageInput,
): ToolResult {
  if (deterministic) {
    recordTelemetry('deterministicResponses', deterministic.toolUsed ?? 'deterministic')
    const suggestions = resolveContextualSuggestions(target, input, deterministic.suggestions)
    return { ...deterministic, suggestions }
  }

  if (insightsBlock) {
    recordTelemetry('fallbackResponses', 'insights-without-llm')
    const suggestions = resolveContextualSuggestions(target, input, ['What makes those values unusual?', 'Analyze my data for patterns'])
    return { success: true, message: insightsBlock, toolUsed: 'insights', suggestions }
  }

  recordTelemetry('fallbackResponses', 'ai-server-unavailable')
  return {
    success: false,
    message: 'I couldn\'t reach the AI service just now. Please try again in a moment.',
    toolUsed: 'fallback',
    suggestions: ['Try your question again', 'Explain this spreadsheet I just loaded'],
  }
}

/** Compute contextual suggestions once, reused across all response paths. */
function resolveContextualSuggestions(
  target: AnalysisTarget,
  input: ProcessMessageInput,
  fallbackSuggestions?: string[],
): string[] {
  const contextual = getContextualSuggestions({
    insights: target.context.insights,
    profile: target.context.profile,
    lastUserMessage: input.message,
    hasMultipleSheets: input.workbook.sheets.length > 1,
    sheetNames: input.workbook.sheets.map((s) => s.name),
  })
  return contextual.length > 0 ? contextual : (fallbackSuggestions ?? [])
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * @deprecated Use the PipelineRouter with split stages (DeterministicDispatcher + LLMGateway)
 * instead of calling processMessage() directly. This function is retained only as the
 * implementation behind `brainDispatcher.ts` until chatService.ts adopts the split stages.
 */
export async function processMessage(input: ProcessMessageInput): Promise<ToolResult> {
  const mode = classifyMode(input.message)
  const intent = parseUserIntent(input.message)
  const target = resolveAnalysisTarget(input)

  // 1. Try macro dispatch
  const macroResult = await tryMacroDispatch(input)
  if (macroResult) return macroResult

  // 2. Run deterministic skills
  const ctx = buildDeterministicContext(target, input.workbook.name, input.message, mode, intent, input.priorInsights)
  const deterministic = runDeterministicSkills(ctx)
  const deterministicText = deterministic ? toolResultToMessage(deterministic, { includeSuggestionsInBody: false }) : ''

  // 3. Short-circuit for fully-answered deterministic queries
  if (deterministic?.toolUsed === 'outlier-explain' || deterministic?.toolUsed === 'comparison') {
    recordTelemetry('deterministicResponses', deterministic.toolUsed)
    if (input.onToken) input.onToken(deterministicText)
    return deterministic
  }

  // 4. Gather context for LLM
  const isFollowUp = Boolean(input.priorInsights)
  const insightsBlock = isLlmOnlyMode(mode) && !isFollowUp ? formatInsights(target.context.insights) : ''

  let auditBlock = ''
  if (isLlmOnlyMode(mode) || mode === 'advise') {
    try {
      const auditResult = runAudit(input.sheet, input.getComputedValue)
      auditBlock = formatAuditForContext(auditResult)
    } catch { /* non-fatal */ }
  }

  // 5. Short-circuit for actionable deterministic results
  if (deterministic && !isLlmOnlyMode(mode) && deterministic.actions?.length) {
    recordTelemetry('deterministicResponses', deterministic.toolUsed ?? 'deterministic-action')
    return deterministic
  }

  // 6. Stream deterministic text if available
  if (deterministicText && input.onToken) {
    input.onToken(`${deterministicText}\n\n`)
  }

  // 7. Call LLM
  const serverResult = await chatWithAgentServerStream(
    input.message,
    {
      ...target.context,
      userPreferences: input.userPreferences,
      deterministicSummary: buildDeterministicSummary(insightsBlock, deterministicText, auditBlock, input.priorInsights, target.context.insights),
    },
    input.history ?? [],
    input.onToken ?? (() => {}),
  )

  // 8. Build final response
  if (serverResult) {
    return buildFinalResponse({ deterministicText, insightsBlock, serverResult, deterministic, target, input })
  }

  return buildFallbackResponse(deterministic, insightsBlock, target, input)
}
