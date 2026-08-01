/**
 * Macro Plan Manager
 *
 * Manages the lifecycle of macro plan presentation and execution.
 * Integrates between the Brain orchestrator and the Macro Executor,
 * handling the UI flow for single-step bypass, multi-step confirmation,
 * rejection, editing, and error recovery.
 *
 * @module macroPlanManager
 */

import type {
  MacroPlan,
  MacroExecutionResult,
  ActionStep,
  UndoManager,
} from '../nlp/types'
import { executeMacro } from './macroExecutor'

// ─── Callback Interface ─────────────────────────────────────────────────────

/**
 * Callbacks that the Brain/UI layer provides to the MacroPlanManager
 * for presenting plans, progress, and errors to the user.
 */
export interface MacroPlanManagerCallbacks {
  /** Present the plan to the user for confirmation */
  presentPlan(plan: MacroPlan): void
  /** Display execution progress */
  showProgress(current: number, total: number): void
  /** Display completion summary */
  showSummary(result: MacroExecutionResult): void
  /** Display error with retry/cancel options */
  showError(message: string): void
  /** Check if user has confirmed the plan */
  isConfirmed(): boolean
  /** Check if user has rejected the plan */
  isRejected(): boolean
  /** Check if user requested cancellation during execution */
  shouldCancel(): boolean
}

// ─── Manager Interface ──────────────────────────────────────────────────────

/**
 * Public interface for the Macro Plan Manager.
 */
export interface MacroPlanManager {
  /**
   * Process a macro plan:
   * - If single step → execute directly (no confirmation)
   * - If multi-step → present for confirmation, then execute on confirm
   * - Handle rejection (cancel), editing (re-present)
   */
  processPlan(plan: MacroPlan, undoManager: UndoManager): Promise<MacroExecutionResult | null>

  /** Edit a specific step's parameters and re-present the plan */
  editStep(index: number, newParams: Record<string, unknown>): MacroPlan

  /** Format plan as a numbered list for display */
  formatPlanForDisplay(plan: MacroPlan): string
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum time to wait for user confirmation in ms */
const CONFIRMATION_POLL_INTERVAL_MS = 50

/** Maximum time to present plan within (from design: 500ms) */
const PRESENT_PLAN_DEADLINE_MS = 500

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * Create a MacroPlanManager instance.
 *
 * @param callbacks - UI/Brain callbacks for user interaction
 * @returns A MacroPlanManager instance
 */
export function createMacroPlanManager(callbacks: MacroPlanManagerCallbacks): MacroPlanManager {
  let currentPlan: MacroPlan | null = null

  /**
   * Format plan as a numbered list for display.
   * Each line: "{n}. {description}"
   */
  function formatPlanForDisplay(plan: MacroPlan): string {
    return plan.steps
      .map((step, index) => `${index + 1}. ${step.description}`)
      .join('\n')
  }

  /**
   * Edit a specific step's parameters and return the updated plan.
   * Does NOT re-present automatically — caller should call processPlan again
   * or use the returned plan for re-presentation.
   */
  function editStep(index: number, newParams: Record<string, unknown>): MacroPlan {
    if (!currentPlan) {
      throw new Error('No active plan to edit')
    }
    if (index < 0 || index >= currentPlan.steps.length) {
      throw new Error(`Step index ${index} out of range (0-${currentPlan.steps.length - 1})`)
    }

    const updatedSteps: ActionStep[] = currentPlan.steps.map((step, i) => {
      if (i === index) {
        return { ...step, params: { ...step.params, ...newParams } }
      }
      return step
    })

    currentPlan = { ...currentPlan, steps: updatedSteps }
    return currentPlan
  }

  /**
   * Wait for user to confirm or reject the plan.
   * Polls the callbacks at a regular interval.
   * Returns 'confirmed', 'rejected', or 'timeout'.
   */
  async function waitForUserDecision(): Promise<'confirmed' | 'rejected'> {
    return new Promise((resolve) => {
      const check = () => {
        if (callbacks.isConfirmed()) {
          resolve('confirmed')
          return
        }
        if (callbacks.isRejected()) {
          resolve('rejected')
          return
        }
        setTimeout(check, CONFIRMATION_POLL_INTERVAL_MS)
      }
      check()
    })
  }

  /**
   * Execute the plan using the macro executor with progress callbacks.
   */
  async function executeCurrentPlan(plan: MacroPlan, undoManager: UndoManager): Promise<MacroExecutionResult> {
    const result = await executeMacro(
      plan,
      {
        onProgress(current: number, total: number) {
          callbacks.showProgress(current, total)
        },
        onStepComplete() {
          // Progress is already reported via onProgress
        },
        shouldCancel() {
          return callbacks.shouldCancel()
        },
      },
      undoManager
    )

    if (result.success) {
      callbacks.showSummary(result)
    }

    return result
  }

  /**
   * Process a macro plan through the full UI flow.
   *
   * Flow:
   * 1. Single-step plan → execute immediately via executeMacro (no confirmation)
   * 2. Multi-step plan → present to user → wait for confirm/reject
   * 3. On confirm → execute via executeMacro with progress callbacks
   * 4. On reject → return null (cancelled)
   * 5. On error → show error via callbacks
   */
  async function processPlan(
    plan: MacroPlan,
    undoManager: UndoManager
  ): Promise<MacroExecutionResult | null> {
    currentPlan = plan

    // Empty plan — nothing to do
    if (plan.steps.length === 0) {
      return null
    }

    // Single-step plan → execute directly, no confirmation needed (Req 6.6)
    if (plan.steps.length === 1) {
      try {
        return await executeCurrentPlan(plan, undoManager)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error during execution'
        callbacks.showError(message)
        return null
      }
    }

    // Multi-step plan → present for confirmation (Req 6.1)
    try {
      callbacks.presentPlan(plan)
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to present plan'
      callbacks.showError(message)
      return null
    }

    // Wait for user decision (Req 6.3, 6.4)
    const decision = await waitForUserDecision()

    if (decision === 'rejected') {
      // User rejected → cancel (Req 6.4)
      return null
    }

    // User confirmed → execute (Req 6.3)
    try {
      return await executeCurrentPlan(currentPlan, undoManager)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error during execution'
      callbacks.showError(message)
      return null
    }
  }

  return {
    processPlan,
    editStep,
    formatPlanForDisplay,
  }
}
