/**
 * NLP Engine Types
 *
 * Shared type definitions for the in-browser NLP engine that replaces
 * regex-based intent parsing with semantic classification.
 */

import type { IntentType } from '@shared/intentTypes'

// ─── NLP Engine State Machine ────────────────────────────────────────────────

/** Lifecycle states of the NLP engine worker */
export type NLPEngineState = 'loading' | 'ready' | 'fallback' | 'updating'

// ─── Worker Communication Messages ──────────────────────────────────────────

/** Messages sent from the main thread to the NLP worker */
export type NLPWorkerRequest =
  | { type: 'init'; modelUrl: string; checksum: string }
  | { type: 'classify'; id: string; text: string; workbookContext: WorkbookContext }
  | { type: 'planMacro'; id: string; text: string; workbookContext: WorkbookContext }
  | { type: 'cancel'; id: string }
  | { type: 'updateModel'; modelUrl: string; checksum: string }

/** Messages sent from the NLP worker back to the main thread */
export type NLPWorkerResponse =
  | { type: 'stateChange'; state: NLPEngineState }
  | { type: 'classifyResult'; id: string; result: ClassificationResult }
  | { type: 'planResult'; id: string; result: MacroPlan }
  | { type: 'error'; id: string; error: string }

// ─── NLP Configuration ──────────────────────────────────────────────────────

/** Configuration for the NLP engine */
export interface NLPConfig {
  /** CDN path for model assets, e.g. "/models/nlp/v{version}/" */
  modelBaseUrl: string
  /** Model version bundled in the app package */
  bundledModelVersion: string
  /** Minimum confidence to use NLP result; below this routes to LLM. Default 0.6 */
  fallbackThreshold: number
  /** Max time to wait for engine initialization in ms. Default 10_000 */
  initTimeoutMs: number
  /** Number of init retries before falling back. Default 1 */
  maxRetries: number
  /** Max action steps in a macro plan. Default 5 (hard max 10) */
  maxMacroSteps: number
  /** Max time for a single inference call in ms. Default 500 */
  inferenceTimeoutMs: number
}

// ─── Classification ─────────────────────────────────────────────────────────

/** Result of intent classification before mapping to UserIntent */
export interface ClassificationResult {
  intentType: IntentType
  /** Confidence score in [0, 1], rounded to 2 decimal places */
  confidence: number
  entities: Entity[]
  isMultiStep: boolean
  /** Raw embedding vector for debugging/telemetry */
  rawEmbedding?: Float32Array
}

// ─── Entity Types ───────────────────────────────────────────────────────────

/** The kind of entity extracted from user input */
export type EntityType = 'column' | 'sheet' | 'number' | 'operator' | 'range'

/** A successfully resolved entity from user input */
export interface ExtractedEntity {
  type: EntityType
  value: string | number
  originalText: string
  resolved: true
}

/** An entity reference that matched zero items in the workbook context */
export interface UnresolvedEntity {
  type: EntityType
  originalText: string
  resolved: false
  reason: 'not_found'
}

/** An entity reference that matched multiple items in the workbook context */
export interface AmbiguousEntity {
  type: EntityType
  originalText: string
  resolved: false
  reason: 'ambiguous'
  /** Matching candidates, up to 5 */
  candidates: string[]
}

/** Discriminated union of all entity resolution outcomes */
export type Entity = ExtractedEntity | UnresolvedEntity | AmbiguousEntity

// ─── Macro Planning ─────────────────────────────────────────────────────────

/** A single atomic operation within a macro plan */
export interface ActionStep {
  /** Tool/intent to execute */
  tool: string
  /** Parameters for the tool */
  params: Record<string, unknown>
  /** Human-readable description, 10–120 characters */
  description: string
}

/** An ordered sequence of action steps decomposed from a multi-step command */
export interface MacroPlan {
  steps: ActionStep[]
  originalText: string
  /** True if more than maxMacroSteps actions were detected and the plan was truncated */
  truncated: boolean
  /** Number of steps that were dropped due to truncation */
  truncatedCount?: number
}

// ─── Macro Execution ────────────────────────────────────────────────────────

/** Result produced by executing a single action step */
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

/** Outcome of executing an entire macro plan */
export interface MacroExecutionResult {
  success: boolean
  completedSteps: Array<{ step: ActionStep; result: ToolResult }>
  failedStep?: { index: number; step: ActionStep; reason: string }
  undoGroupId: string
}

/** Callbacks for monitoring macro execution progress */
export interface MacroExecutorCallbacks {
  onProgress(current: number, total: number): void
  onStepComplete(index: number, result: ToolResult): void
  shouldCancel(): boolean
}

/** Interface for managing undo groups during macro execution */
export interface UndoManager {
  beginGroup(label: string): string
  commitGroup(groupId: string): void
  rollbackGroup(groupId: string): void
}

// ─── Workbook Context ───────────────────────────────────────────────────────

/** Contextual information about the active workbook, used for entity resolution */
export interface WorkbookContext {
  activeSheetId: string
  sheets: Array<{
    id: string
    name: string
    columns: Array<{ letter: string; headerName: string; index: number }>
  }>
}

// ─── Model Management ───────────────────────────────────────────────────────

/** Metadata about a model version available for download */
export interface ModelManifest {
  version: string
  url: string
  /** SHA-256 checksum for integrity validation */
  checksum: string
  /** Size in bytes */
  size: number
}

// ─── Error Types ────────────────────────────────────────────────────────────

/** Union of all NLP-related error types with discriminated error codes */
export type NLPError =
  | { code: 'INIT_TIMEOUT'; message: string }
  | { code: 'INIT_NETWORK_ERROR'; message: string; cause?: Error }
  | { code: 'INFERENCE_TIMEOUT'; message: string }
  | { code: 'WORKER_CRASH'; message: string }
  | { code: 'MODEL_CHECKSUM_MISMATCH'; expected: string; actual: string }
  | { code: 'MODEL_DOWNLOAD_FAILED'; message: string }
  | { code: 'MACRO_STEP_FAILED'; stepIndex: number; stepName: string; reason: string }
  | { code: 'MACRO_STEP_TIMEOUT'; stepIndex: number; stepName: string }
  | { code: 'DESERIALIZATION_FAILED'; errorType: 'parse_failure' | 'schema_validation_failure'; raw: string }
