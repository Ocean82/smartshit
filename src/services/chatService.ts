/**
 * Chat Service — orchestrates the full message flow for the AI chat.
 *
 * Uses the unified PipelineRouter to process messages through ordered stages:
 * 1. @-mention sheet switching (pre-pipeline input normalization)
 * 2. GoalRouter — Total / By Category / By Month
 * 3. AgentParser — instant regex tool calls
 * 4. TemplateResolver — gallery template matching
 * 5. IntentClassifier — enriches context (never claims)
 * 6. SemanticCapabilityRouter — MiniLM capability scoring (Tier 2)
 * 7. MacroPlanner — multi-clause → pending execute_macro
 * 8. DeterministicDispatcher — local skills (clean/report/budget/query)
 * 9. LLMGateway — server-side LLM terminal stage
 *
 * The service receives thin callbacks for state mutations rather than
 * depending on the store directly. This allows tests to verify behavior
 * without spinning up the full Zustand store.
 */

import type { ChatMessage, ProviderMeta, SheetData, Selection, WorkbookData, ActionScope } from '@/types'
import type { ExecutionContext } from '@/agent/executor'
import { toolResultToChatMessage } from '@/ai/responseBuilder'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { summarizeOlderMessages } from '@/ai/conversationSummary'
import { classifyMode, isLlmOnlyMode } from '@/ai/mode'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { AttachedFilePreview } from '@/ai/types'
import { captureActionScope } from '@/lib/actionScope'
import { classifyRequestSafety } from '@shared/requestSafety'
import { sanitizeActionParams } from '@shared/actionParams'
import {
  createPipelineRouter,
  createGoalRouterStage,
  createAgentParserStage,
  createTemplateResolverStage,
  createIntentClassifierStage,
  createSemanticCapabilityRouterStage,
  createMacroPlannerStage,
  createDeterministicDispatcherStage,
  createLLMGatewayStage,
  type PipelineContext,
  type PipelineStage,
  type StageResult,
} from '@/ai/pipeline'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatServiceDeps {
  /** Get the current workbook */
  getWorkbook: () => WorkbookData
  /** Get the active sheet */
  getActiveSheet: () => SheetData
  /** Get computed cell value on the active sheet */
  getComputedValue: (row: number, col: number) => string
  /** Get a computed value from any sheet (used by cross-sheet comparisons). */
  getSheetComputedValue: (sheetId: string, row: number, col: number) => string
  /** Get the current selection */
  getSelection: () => Selection | null
  /** Get the active sheet ID */
  getActiveSheetId: () => string
  /** Get the monotonic workbook revision counter */
  getWorkbookRevision: () => number
  /** Get the attached file preview */
  getAttachedPreview: () => AttachedFilePreview | null
  /** Get the chat messages for history */
  getMessages: () => ChatMessage[]
  /** Switch to a different sheet */
  setActiveSheet: (sheetId: string) => void
  /** Push a history snapshot for undo */
  pushHistory: (desc: string) => void
  /** Build an execution context for running tools */
  buildExecContext: (opts?: { suppressHistory?: boolean }) => ExecutionContext
  /** Update the streaming message with a token */
  appendToken: (msgId: string, token: string) => void
  /** Finalize a message (replace the streaming placeholder) */
  finalizeMessage: (msgId: string, msg: ChatMessage) => void
  /** Set processing state */
  setProcessing: (v: boolean) => void
  /** Fallback handler for when LLM fails */
  processLocalFallback: (input: string) => ChatMessage
  /** Skip Tier-2 capability router (user chose "Something else…") */
  skipCapabilityRouter?: boolean
  /** User clarified to this capability — Tier 2 short-circuits (no re-clarify). */
  resolvedCapabilityId?: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Process a user chat message through the unified pipeline.
 *
 * Stage order (first to claim wins):
 * 2. GoalRouter — Total / By Category / By Month
 * 3. AgentParser — instant regex tool calls (sort, filter, add/delete row, etc.)
 * 4. TemplateResolver — gallery template matching ("Create a budget")
 * 5. IntentClassifier — enriches context with intent/mode (never claims)
 * 6. MacroPlanner — multi-clause plans as pending execute_macro
 * 7. DeterministicDispatcher — local skills (may claim or pass)
 * 8. LLMGateway — server LLM (always claims)
 */
/** Store snapshot `captureActionScope` needs, derived from the deps callbacks. */
function getScopeSource(deps: ChatServiceDeps) {
  return {
    workbook: deps.getWorkbook(),
    activeSheetId: deps.getActiveSheetId(),
    selection: deps.getSelection(),
    workbookRevision: deps.getWorkbookRevision(),
  }
}

/**
 * Build the stage chain.
 *
 * `isNonCommand` drops the three stages that mutate immediately (goal router,
 * agent parser, template resolver) so a negated / explanatory / hypothetical /
 * quoted utterance can never change the sheet, no matter which command
 * fragments it contains. Explicit direct commands keep their existing
 * immediate-execution behaviour.
 */
function buildStages(deps: ChatServiceDeps, isNonCommand: boolean): PipelineStage[] {
  const stages: PipelineStage[] = []
  if (!isNonCommand) {
    stages.push(createGoalRouterStage({ buildExecContext: deps.buildExecContext, pushHistory: deps.pushHistory }))
    stages.push(createAgentParserStage({ buildExecContext: deps.buildExecContext, pushHistory: deps.pushHistory }))
    stages.push(createTemplateResolverStage({ buildExecContext: deps.buildExecContext, pushHistory: deps.pushHistory }))
  }
  stages.push(createIntentClassifierStage())
  stages.push(createSemanticCapabilityRouterStage({ buildExecContext: deps.buildExecContext, pushHistory: deps.pushHistory }))
  stages.push(createMacroPlannerStage())
  stages.push(createDeterministicDispatcherStage())
  stages.push(createLLMGatewayStage())
  return stages
}

export async function processChatMessage(
  input: string,
  streamingMsgId: string,
  deps: ChatServiceDeps,
): Promise<void> {
  const {
    getWorkbook,
    getActiveSheet,
    getComputedValue,
    getSheetComputedValue,
    getSelection,
    getActiveSheetId,
    getAttachedPreview,
    getMessages,
    setActiveSheet,
    appendToken,
    finalizeMessage,
    setProcessing,
    processLocalFallback,
    skipCapabilityRouter = false,
    resolvedCapabilityId,
  } = deps

  try {
    // ─── @-mention sheet switching (pre-pipeline input normalization) ─────
    const sheetMention = input.match(/@([A-Za-z0-9_ -]+)/)
    if (sheetMention) {
      const mentionedName = sheetMention[1].trim()
      const workbook = getWorkbook()
      const targetSheet = workbook.sheets.find(
        (s) => s.name.toLowerCase() === mentionedName.toLowerCase()
      )
      if (targetSheet && targetSheet.id !== getActiveSheetId()) {
        setActiveSheet(targetSheet.id)
      }
    }

    // ─── Build pipeline context ──────────────────────────────────────────
    const sheet = getActiveSheet()
    const messages = getMessages()
    // Drop the current turn's two placeholders (`.slice(0, -2)`), then condense
    // older turns beyond the recent window into one summary line instead of
    // silently discarding them (the old `.slice(-12)` dropped everything older).
    const recent = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -2)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    const { summary, recentMessages } = summarizeOlderMessages(recent)
    const history = summary
      ? [{ role: 'user' as const, content: summary }, ...recentMessages]
      : recentMessages

    const priorInsights = messages
      .filter((m) => m.role === 'assistant' && m.insightsSnapshot)
      .at(-1)?.insightsSnapshot as SheetInsights | undefined

    // Scope captured once, before any stage runs. Every proposal this turn
    // produces is bound to it, so it can be rejected if the workbook, sheet,
    // selection or revision moves before the user clicks Apply.
    const scope: ActionScope = captureActionScope(getScopeSource(deps))

    const pipelineContext: PipelineContext = {
      message: input,
      workbook: getWorkbook(),
      sheet,
      selection: getSelection(),
      getComputedValue,
      getSheetComputedValue,
      attachedPreview: getAttachedPreview(),
      priorInsights: priorInsights ?? null,
      history,
      onToken: (token) => appendToken(streamingMsgId, token),
      skipCapabilityRouter,
      resolvedCapabilityId,
      clarificationSource: resolvedCapabilityId ? 'clarification_chip' : undefined,
    }

    // ─── Create and run pipeline ─────────────────────────────────────────
    // A non-command (negation, explanation, hypothetical, quoted example) is
    // never allowed to reach a stage that mutates immediately. Those stages are
    // simply not in the chain, so the request falls through to the
    // proposal-only and explanatory stages.
    const router = createPipelineRouter(buildStages(deps, classifyRequestSafety(input).isNonCommand))

    const result = await router.process(pipelineContext)

    // ─── Convert StageResult → ChatMessage ───────────────────────────────
    const finalMsg = stageResultToChatMessage(result, streamingMsgId, {
      sheet,
      getComputedValue,
      input,
      scope,
      processLocalFallback,
      insightsSnapshot: buildSpreadsheetContext(getWorkbook(), sheet, getSelection(), getComputedValue).insights as unknown as Record<string, unknown>,
    })

    finalizeMessage(streamingMsgId, finalMsg)
    setProcessing(false)
  } catch (err) {
    // On unexpected error, finalize with a generic error message
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    finalizeMessage(streamingMsgId, {
      id: streamingMsgId,
      role: 'assistant',
      content: `⚠️ ${message}`,
      timestamp: Date.now(),
    })
    setProcessing(false)
  }
}

// ─── Result Conversion ───────────────────────────────────────────────────────

interface ConversionContext {
  sheet: SheetData
  getComputedValue: (row: number, col: number) => string
  input: string
  /** Scope every emitted action is bound to. */
  scope: ActionScope
  processLocalFallback: (input: string) => ChatMessage
  insightsSnapshot?: Record<string, unknown>
}

/**
 * A server refusal (auth / rate limit / quota) is a real, actionable answer.
 * It must survive to the user instead of being replaced by a local fallback
 * that pretends the request was handled.
 */
function isServerRefusal(result: StageResult): boolean {
  return result.metadata?.source === 'ai-server-refused'
}

/**
/**
 * Runtime shape check for providerMeta to avoid rendering malformed values.
 */
function isProviderMeta(value: unknown): value is ProviderMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).provider === 'string' &&
    typeof (value as Record<string, unknown>).model === 'string'
  );
}

/**
 * Convert a pipeline StageResult into a ChatMessage for display.
 *
 * Active stages that emit ToolResult-compatible output
 * (`deterministic-dispatcher`, `llm-gateway`) get full action preview rendering.
 * `macro-planner` / `agent-parser` with actions use the same path.
 */
function stageResultToChatMessage(
  result: StageResult,
  msgId: string,
  ctx: ConversionContext,
): ChatMessage {
  if (result.stageName === 'llm-gateway' || result.stageName === 'deterministic-dispatcher') {
    // Actions that came back from the model are untrusted input: strip anything
    // that would let the model decide whether a change is safe to apply.
    const actions = result.actions?.map((a) => ({
      tool: a.tool,
      params: sanitizeActionParams(a.params),
      description: a.description,
    }))

    const toolResult = {
      success: result.success,
      message: result.message,
      toolUsed: result.metadata?.toolUsed as string | undefined,
      reasoning: result.metadata?.reasoning as string | undefined,
      suggestions: result.suggestions,
      providerMeta: isProviderMeta(result.metadata?.providerMeta)
        ? result.metadata!.providerMeta as ProviderMeta
        : undefined,
      actions,
    }

    // An explicit server refusal (sign-in / rate limit / quota) is the answer.
    // Falling back to local insights here would hide the CTA the server worded
    // for the user and pretend the request succeeded.
    if (isServerRefusal(result)) {
      return {
        id: msgId,
        role: 'assistant',
        content: `⚠️ ${result.message}`,
        timestamp: Date.now(),
        suggestions: result.suggestions,
        providerMeta: toolResult.providerMeta,
      }
    }

    // If LLM/deterministic failed and mode isn't explain/advise, try local fallback
    if (!result.success && !isLlmOnlyMode(classifyMode(ctx.input))) {
      return { ...ctx.processLocalFallback(ctx.input), id: msgId }
    }

    return toolResultToChatMessage(toolResult, {
      id: msgId,
      insightsSnapshot: ctx.insightsSnapshot,
      previewContext: { sheet: ctx.sheet, getComputedValue: ctx.getComputedValue, scope: ctx.scope },
    })
  }

  // Agent parser / macro / Tier-2 capability router with actions → Apply UI
  if (
    (
      result.stageName === 'agent-parser'
      || result.stageName === 'macro-planner'
      || result.stageName === 'semantic-capability-router'
    )
    && result.actions?.length
  ) {
    const toolResult = {
      success: result.success,
      message: result.message,
      toolUsed: result.metadata?.toolUsed as string | undefined,
      actions: result.actions.map((a) => ({
        tool: a.tool,
        params: a.params,
        description: a.description,
      })),
    }
    return toolResultToChatMessage(toolResult, {
      id: msgId,
      previewContext: { sheet: ctx.sheet, getComputedValue: ctx.getComputedValue, scope: ctx.scope },
    })
  }

  // Simple stages (agent-parser text, template-resolver, pipeline-fallback)
  // produce direct text messages
  return {
    id: msgId,
    role: 'assistant',
    content: result.message,
    timestamp: Date.now(),
    suggestions: result.suggestions,
  }
}
