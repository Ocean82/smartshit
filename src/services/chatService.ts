/**
 * Chat Service — orchestrates the full message flow for the AI chat.
 *
 * Uses the unified PipelineRouter to process messages through ordered stages:
 * 1. @-mention sheet switching (pre-pipeline input normalization)
 * 2. GoalRouter — Total / By Category / By Month
 * 3. AgentParser — instant regex tool calls
 * 4. TemplateResolver — gallery template matching
 * 4. IntentClassifier — enriches context (never claims)
 * 5. MacroPlanner — multi-clause → pending execute_macro
 * 6. DeterministicDispatcher — local skills (clean/report/budget/query)
 * 7. LLMGateway — server-side LLM terminal stage
 *
 * The service receives thin callbacks for state mutations rather than
 * depending on the store directly. This allows tests to verify behavior
 * without spinning up the full Zustand store.
 */

import type { ChatMessage, ProviderMeta, SheetData, Selection, WorkbookData } from '@/types'
import type { ExecutionContext } from '@/agent/executor'
import { toolResultToChatMessage } from '@/ai/responseBuilder'
import { buildSpreadsheetContext } from '@/ai/buildContext'
import { classifyMode, isLlmOnlyMode } from '@/ai/mode'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { AttachedFilePreview } from '@/ai/types'
import {
  createPipelineRouter,
  createGoalRouterStage,
  createAgentParserStage,
  createTemplateResolverStage,
  createIntentClassifierStage,
  createMacroPlannerStage,
  createDeterministicDispatcherStage,
  createLLMGatewayStage,
  type PipelineContext,
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
    pushHistory,
    buildExecContext,
    appendToken,
    finalizeMessage,
    setProcessing,
    processLocalFallback,
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
    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -2)
      .slice(-12)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const priorInsights = messages
      .filter((m) => m.role === 'assistant' && m.insightsSnapshot)
      .at(-1)?.insightsSnapshot as SheetInsights | undefined

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
    }

    // ─── Create and run pipeline ─────────────────────────────────────────
    const router = createPipelineRouter([
      createGoalRouterStage({ buildExecContext, pushHistory }),
      createAgentParserStage({ buildExecContext, pushHistory }),
      createTemplateResolverStage({ buildExecContext, pushHistory }),
      createIntentClassifierStage(),
      createMacroPlannerStage(),
      createDeterministicDispatcherStage(),
      createLLMGatewayStage(),
    ])

    const result = await router.process(pipelineContext)

    // ─── Convert StageResult → ChatMessage ───────────────────────────────
    const finalMsg = stageResultToChatMessage(result, streamingMsgId, {
      sheet,
      getComputedValue,
      input,
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
  processLocalFallback: (input: string) => ChatMessage
  insightsSnapshot?: Record<string, unknown>
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
    const toolResult = {
      success: result.success,
      message: result.message,
      toolUsed: result.metadata?.toolUsed as string | undefined,
      reasoning: result.metadata?.reasoning as string | undefined,
      suggestions: result.suggestions,
      providerMeta: isProviderMeta(result.metadata?.providerMeta)
        ? result.metadata!.providerMeta as ProviderMeta
        : undefined,
      actions: result.actions?.map((a) => ({
        tool: a.tool,
        params: a.params,
        description: a.description,
      })),
    }

    // If LLM/deterministic failed and mode isn't explain/advise, try local fallback
    if (!result.success && !isLlmOnlyMode(classifyMode(ctx.input))) {
      return { ...ctx.processLocalFallback(ctx.input), id: msgId }
    }

    return toolResultToChatMessage(toolResult, {
      id: msgId,
      insightsSnapshot: ctx.insightsSnapshot,
      previewContext: { sheet: ctx.sheet, getComputedValue: ctx.getComputedValue },
    })
  }

  // Agent parser / macro planner with actions need toolResultToChatMessage
  if (
    (result.stageName === 'agent-parser' || result.stageName === 'macro-planner')
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
      previewContext: { sheet: ctx.sheet, getComputedValue: ctx.getComputedValue },
    })
  }

  // Simple stages (agent-parser text, template-resolver, pipeline-fallback)
  // produce direct text messages
  return {
    id: msgId,
    role: 'assistant',
    content: result.message,
    timestamp: Date.now(),
  }
}
