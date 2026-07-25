/**
 * Sandbox Execution Engine — Type Definitions
 *
 * Types for the QuickJS-based sandboxed script execution system.
 */

import type { SheetData, CellFormat } from '@/types'

// ─── Input Types ─────────────────────────────────────────────────────────────

/** Context passed to the sandbox for script execution. */
export interface ScriptContext {
  /** The active sheet data (read-only snapshot). */
  sheet: SheetData
  /** Function to get computed/displayed cell values (resolves formulas). */
  getComputedValue: (row: number, col: number) => string
}

/** Options for script execution. */
export interface ScriptOptions {
  /** Execution timeout in milliseconds. Default: 5000. */
  timeout?: number
  /** Maximum memory in bytes. Default: 16MB. */
  memoryLimit?: number
  /** Maximum number of cell mutations allowed. Default: 50000. */
  maxMutations?: number
}

// ─── Output Types ────────────────────────────────────────────────────────────

/** Successful sandbox execution result. */
export interface SandboxSuccess {
  success: true
  /** Cell value updates to apply. */
  cellUpdates: Record<string, { value: string | number | boolean | null; formula?: string }>
  /** Cell format updates to apply. */
  formatUpdates: Record<string, Partial<CellFormat>>
  /** Row deletions (0-indexed row numbers, sorted descending for safe deletion). */
  rowDeletions: number[]
  /** Row insertions (afterRow values, 0-indexed). */
  rowInsertions: number[]
  /** Log output from the script. */
  logs: string[]
  /** Human-readable summary of what the script did. */
  summary: string
  /** Execution time in milliseconds. */
  executionTime: number
}

/** Failed sandbox execution result. */
export interface SandboxFailure {
  success: false
  /** User-friendly error message. */
  error: string
  /** Detailed error (for debugging / telemetry). */
  detail?: string
  /** Log output captured before the error. */
  logs: string[]
}

/** Combined result type. */
export type SandboxResult = SandboxSuccess | SandboxFailure

// ─── Internal Types ──────────────────────────────────────────────────────────

/** Collected mutations during script execution. */
export interface MutationCollector {
  cellUpdates: Record<string, { value: string | number | boolean | null; formula?: string }>
  formatUpdates: Record<string, Partial<CellFormat>>
  rowDeletions: number[]
  rowInsertions: number[]
  logs: string[]
  mutationCount: number
}
