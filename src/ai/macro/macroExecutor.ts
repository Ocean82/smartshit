/**
 * Macro Execution Engine
 *
 * Executes macro plans transactionally with undo grouping.
 * Steps are executed in sequence, passing accumulated results as context.
 * All mutations are wrapped in a single Undo_Group for atomic rollback.
 *
 * @module macroExecutor
 */

import type {
  ActionStep,
  MacroPlan,
  MacroExecutionResult,
  MacroExecutorCallbacks,
  UndoManager,
  ToolResult,
} from '../nlp/types'

// ─── Step Executor Type ─────────────────────────────────────────────────────

/**
 * Function signature for executing a single action step.
 * Receives the step definition and accumulated context from prior steps.
 */
export type StepExecutor = (
  step: ActionStep,
  context: ToolResult[]
) => Promise<ToolResult>

// ─── Default Stub Step Executor ─────────────────────────────────────────────

/**
 * Default stub step executor.
 * Returns a successful result echoing the tool and params.
 * Will be replaced by real tool execution in integration (task 11.2).
 */
export const defaultStepExecutor: StepExecutor = async (step: ActionStep) => {
  return {
    success: true,
    data: { tool: step.tool, params: step.params },
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Per-step execution timeout in milliseconds */
const STEP_TIMEOUT_MS = 30_000

// ─── Timeout Utility ────────────────────────────────────────────────────────

/**
 * Races a promise against a timeout. Rejects with a timeout error if
 * the promise does not resolve within the specified duration.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Step execution timed out after ${ms / 1000} seconds`))
    }, ms)

    promise.then(
      (result) => {
        clearTimeout(timer)
        resolve(result)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

// ─── Macro Executor ─────────────────────────────────────────────────────────

/**
 * Executes a macro plan transactionally.
 *
 * - Begins an undo group before execution starts.
 * - Executes each step in sequence, passing accumulated results as context.
 * - Reports progress via callbacks after each step.
 * - On failure or timeout: halts, rolls back all completed steps, reports failure.
 * - On cancellation: halts after current step, rolls back, reports cancellation.
 * - On success: commits the undo group and returns a completion summary.
 *
 * @param plan - The macro plan to execute
 * @param callbacks - Progress and cancellation callbacks
 * @param undoManager - Manager for transactional undo groups
 * @param stepExecutor - Optional injectable step executor (defaults to stub)
 */
export async function executeMacro(
  plan: MacroPlan,
  callbacks: MacroExecutorCallbacks,
  undoManager: UndoManager,
  stepExecutor: StepExecutor = defaultStepExecutor
): Promise<MacroExecutionResult> {
  const label = 'Macro: ' + plan.originalText.slice(0, 50)
  const groupId = undoManager.beginGroup(label)

  const completedSteps: Array<{ step: ActionStep; result: ToolResult }> = []
  const context: ToolResult[] = []

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]

    // Check for user cancellation before starting the step
    if (callbacks.shouldCancel()) {
      undoManager.rollbackGroup(groupId)
      return {
        success: false,
        completedSteps,
        failedStep: {
          index: i,
          step,
          reason: 'User cancelled macro execution',
        },
        undoGroupId: groupId,
      }
    }

    // Report progress (1-indexed for display)
    callbacks.onProgress(i + 1, plan.steps.length)

    // Execute the step with timeout
    let result: ToolResult
    try {
      result = await withTimeout(stepExecutor(step, context), STEP_TIMEOUT_MS)
    } catch (error: unknown) {
      // Step failed or timed out — rollback and report
      undoManager.rollbackGroup(groupId)
      const reason =
        error instanceof Error
          ? error.message
          : 'Unknown error'
      return {
        success: false,
        completedSteps,
        failedStep: { index: i, step, reason },
        undoGroupId: groupId,
      }
    }

    // Check if step itself reported failure
    if (!result.success) {
      undoManager.rollbackGroup(groupId)
      return {
        success: false,
        completedSteps,
        failedStep: {
          index: i,
          step,
          reason: result.error || 'Step reported failure',
        },
        undoGroupId: groupId,
      }
    }

    // Step succeeded — record and forward context
    completedSteps.push({ step, result })
    context.push(result)
    callbacks.onStepComplete(i, result)
  }

  // All steps succeeded — commit
  undoManager.commitGroup(groupId)
  return {
    success: true,
    completedSteps,
    undoGroupId: groupId,
  }
}
