/**
 * BrainDispatcher Stage — LEGACY transitional adapter.
 *
 * @deprecated This stage wraps the monolithic brain.ts `processMessage()` function.
 * It exists as a bridge while chatService.ts still uses the combined brain flow.
 *
 * The replacement is the split pipeline with separate stages:
 * - DeterministicDispatcher (`./deterministicDispatcher.ts`) — handles local skills
 * - LLMGateway (`./llmGateway.ts`) — handles server-side LLM communication
 *
 * Once chatService.ts is updated to use createDeterministicDispatcherStage() and
 * createLLMGatewayStage() directly, this file and brain.ts's processMessage() can
 * be deleted.
 *
 * Current brain.ts responsibilities handled by this stage:
 * 1. Deterministic skill routing (clean, report, compare, budget, query, outliers)
 * 2. Macro planning (deferred — code exists but executor is a stub)
 * 3. LLM server streaming for explain/advise/chat
 * 4. Local fallback when LLM fails
 *
 * This stage ALWAYS claims — it's the terminal stage in the pipeline.
 * No input should fall through past it.
 */

import type { PipelineContext, PipelineStage, StageResult } from '../types'
import { processMessage, type ProcessMessageInput } from '@/ai/brain'

export function createBrainDispatcherStage(): PipelineStage {
  return {
    name: 'brain-dispatcher',

    async process(context: PipelineContext): Promise<StageResult | null> {
      const input: ProcessMessageInput = {
        message: context.message,
        workbook: context.workbook,
        sheet: context.sheet,
        selection: context.selection,
        getComputedValue: context.getComputedValue,
        getSheetComputedValue: context.getSheetComputedValue,
        attachedPreview: context.attachedPreview,
        priorInsights: context.priorInsights ?? null,
        history: context.history,
        onToken: context.onToken,
      }

      const result = await processMessage(input)

      // Convert ToolResult → StageResult
      return {
        success: result.success,
        message: result.message,
        actions: result.actions?.map((a) => ({
          tool: a.tool,
          params: a.params,
          description: a.description,
        })),
        suggestions: result.suggestions,
        stageName: 'brain-dispatcher',
        metadata: {
          toolUsed: result.toolUsed,
          reasoning: result.reasoning,
        },
      }
    },
  }
}
