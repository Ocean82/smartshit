/**
 * Pipeline types — defines the stage interface and shared context/result types
 * for the unified intent routing pipeline.
 */

import type { Selection, SheetData, WorkbookData } from '@/types'
import type { AttachedFilePreview, ToolResult } from '@/ai/types'
import type { SheetInsights } from '@/ai/sheetInsights'
import type { UserIntent } from '@shared/intentTypes'
import type { AgentMode } from '@shared/mode'

// ─── Pipeline Context ───────────────────────────────────────────────────────

/**
 * Shared context passed through pipeline stages.
 * Mutable: IntentClassifier enriches it with intent/mode for downstream stages.
 */
export interface PipelineContext {
  /** Raw user message */
  message: string
  /** Full workbook state */
  workbook: WorkbookData
  /** Active sheet data */
  sheet: SheetData
  /** Current cell selection */
  selection: Selection | null
  /** Computed cell value accessor */
  getComputedValue: (row: number, col: number) => string
  /** Cross-sheet computed value accessor */
  getSheetComputedValue?: (sheetId: string, row: number, col: number) => string
  /** Attached file preview (for imports) */
  attachedPreview?: AttachedFilePreview | null
  /** Prior insights from last assistant message */
  priorInsights?: SheetInsights | null
  /** Conversation history for LLM context */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Streaming token callback */
  onToken?: (token: string) => void

  // ─── Enriched by IntentClassifier stage ─────────────────────────────────
  /** Classified intent (set by IntentClassifier stage) */
  intent?: UserIntent
  /** Message mode: explain/advise/act/help/chat (set by IntentClassifier stage) */
  mode?: AgentMode
}

// ─── Stage Result ───────────────────────────────────────────────────────────

/** Tool action for preview/apply pattern */
export interface StageAction {
  tool: string
  params: Record<string, unknown>
  description: string
}

/**
 * Result produced when a stage claims the input.
 * Contains everything needed to render a chat response.
 */
export interface StageResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Chat message content */
  message: string
  /** Optional tool actions (mutations, previews) */
  actions?: StageAction[]
  /** Follow-up suggestions for the user */
  suggestions?: string[]
  /** Name of the stage that produced this result */
  stageName: string
  /** Additional metadata (toolUsed, modified count, insights, etc.) */
  metadata?: Record<string, unknown>
}

// ─── Pipeline Stage Interface ───────────────────────────────────────────────

/**
 * A single processing step in the pipeline.
 * Returns a StageResult to claim the input, or null to pass to the next stage.
 */
export interface PipelineStage {
  /** Human-readable stage name (for logging and attribution) */
  readonly name: string
  /**
   * Process the user input.
   * @returns StageResult if this stage claims the input, null to pass through
   */
  process(context: PipelineContext): Promise<StageResult | null>
}

// ─── Stage Timing Metadata ──────────────────────────────────────────────────

/** Timing information for observability */
export interface StageTiming {
  stageName: string
  durationMs: number
  claimed: boolean
}
