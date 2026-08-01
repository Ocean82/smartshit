/**
 * Unit tests for the Macro Execution Engine
 *
 * Tests sequential execution, context forwarding, undo group management,
 * timeout handling, failure rollback, cancellation, and progress reporting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeMacro, defaultStepExecutor } from '../macroExecutor'
import type { StepExecutor } from '../macroExecutor'
import type {
  ActionStep,
  MacroPlan,
  MacroExecutorCallbacks,
  UndoManager,
  ToolResult,
} from '../../nlp/types'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createMockUndoManager(): UndoManager & {
  beginGroupCalls: string[]
  commitGroupCalls: string[]
  rollbackGroupCalls: string[]
} {
  const manager = {
    beginGroupCalls: [] as string[],
    commitGroupCalls: [] as string[],
    rollbackGroupCalls: [] as string[],
    beginGroup(label: string): string {
      const id = `undo-group-${manager.beginGroupCalls.length}`
      manager.beginGroupCalls.push(label)
      return id
    },
    commitGroup(groupId: string): void {
      manager.commitGroupCalls.push(groupId)
    },
    rollbackGroup(groupId: string): void {
      manager.rollbackGroupCalls.push(groupId)
    },
  }
  return manager
}

function createMockCallbacks(options?: {
  cancelAfterStep?: number
}): MacroExecutorCallbacks & {
  progressCalls: Array<{ current: number; total: number }>
  stepCompleteCalls: Array<{ index: number; result: ToolResult }>
} {
  let completedCount = 0
  const cbs = {
    progressCalls: [] as Array<{ current: number; total: number }>,
    stepCompleteCalls: [] as Array<{ index: number; result: ToolResult }>,
    onProgress(current: number, total: number): void {
      cbs.progressCalls.push({ current, total })
    },
    onStepComplete(index: number, result: ToolResult): void {
      completedCount++
      cbs.stepCompleteCalls.push({ index, result })
    },
    shouldCancel(): boolean {
      if (options?.cancelAfterStep !== undefined) {
        return completedCount >= options.cancelAfterStep
      }
      return false
    },
  }
  return cbs
}

function createStep(tool: string, description?: string): ActionStep {
  return {
    tool,
    params: { action: tool },
    description: description || `Execute ${tool} operation`,
  }
}

function createPlan(steps: ActionStep[], originalText?: string): MacroPlan {
  return {
    steps,
    originalText: originalText || steps.map((s) => s.tool).join(', '),
    truncated: false,
  }
}

// ─── Default Step Executor ──────────────────────────────────────────────────

describe('defaultStepExecutor', () => {
  it('returns success with tool and params echoed', async () => {
    const step = createStep('filter')
    const result = await defaultStepExecutor(step, [])
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ tool: 'filter', params: { action: 'filter' } })
  })
})

// ─── executeMacro ───────────────────────────────────────────────────────────

describe('executeMacro', () => {
  let undoManager: ReturnType<typeof createMockUndoManager>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    undoManager = createMockUndoManager()
    callbacks = createMockCallbacks()
  })

  describe('successful execution', () => {
    it('executes a single-step plan successfully', async () => {
      const plan = createPlan([createStep('filter')])
      const result = await executeMacro(plan, callbacks, undoManager)

      expect(result.success).toBe(true)
      expect(result.completedSteps).toHaveLength(1)
      expect(result.completedSteps[0].step.tool).toBe('filter')
      expect(result.completedSteps[0].result.success).toBe(true)
      expect(result.failedStep).toBeUndefined()
    })

    it('executes multiple steps in sequence', async () => {
      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
      ])
      const result = await executeMacro(plan, callbacks, undoManager)

      expect(result.success).toBe(true)
      expect(result.completedSteps).toHaveLength(3)
      expect(result.completedSteps[0].step.tool).toBe('filter')
      expect(result.completedSteps[1].step.tool).toBe('sort')
      expect(result.completedSteps[2].step.tool).toBe('export')
    })

    it('commits the undo group on success', async () => {
      const plan = createPlan([createStep('filter')])
      await executeMacro(plan, callbacks, undoManager)

      expect(undoManager.commitGroupCalls).toHaveLength(1)
      expect(undoManager.rollbackGroupCalls).toHaveLength(0)
    })

    it('returns a valid undoGroupId', async () => {
      const plan = createPlan([createStep('filter')])
      const result = await executeMacro(plan, callbacks, undoManager)

      expect(result.undoGroupId).toBeDefined()
      expect(typeof result.undoGroupId).toBe('string')
    })
  })

  describe('context forwarding', () => {
    it('passes accumulated results to each subsequent step', async () => {
      const receivedContexts: ToolResult[][] = []

      const trackingExecutor: StepExecutor = async (step, context) => {
        receivedContexts.push([...context])
        return { success: true, data: { tool: step.tool, step: receivedContexts.length } }
      }

      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
      ])
      await executeMacro(plan, callbacks, undoManager, trackingExecutor)

      // First step receives empty context
      expect(receivedContexts[0]).toHaveLength(0)
      // Second step receives result of first
      expect(receivedContexts[1]).toHaveLength(1)
      expect(receivedContexts[1][0].data).toEqual({ tool: 'filter', step: 1 })
      // Third step receives results of first two
      expect(receivedContexts[2]).toHaveLength(2)
      expect(receivedContexts[2][0].data).toEqual({ tool: 'filter', step: 1 })
      expect(receivedContexts[2][1].data).toEqual({ tool: 'sort', step: 2 })
    })
  })

  describe('undo group management', () => {
    it('begins undo group with truncated label from originalText', async () => {
      const longText = 'a'.repeat(100)
      const plan = createPlan([createStep('filter')], longText)
      await executeMacro(plan, callbacks, undoManager)

      expect(undoManager.beginGroupCalls).toHaveLength(1)
      expect(undoManager.beginGroupCalls[0]).toBe('Macro: ' + longText.slice(0, 50))
    })

    it('wraps all mutations in a single undo group', async () => {
      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
      ])
      await executeMacro(plan, callbacks, undoManager)

      expect(undoManager.beginGroupCalls).toHaveLength(1)
      expect(undoManager.commitGroupCalls).toHaveLength(1)
    })
  })

  describe('progress reporting', () => {
    it('reports progress for each step (1-indexed)', async () => {
      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
      ])
      await executeMacro(plan, callbacks, undoManager)

      expect(callbacks.progressCalls).toHaveLength(3)
      expect(callbacks.progressCalls[0]).toEqual({ current: 1, total: 3 })
      expect(callbacks.progressCalls[1]).toEqual({ current: 2, total: 3 })
      expect(callbacks.progressCalls[2]).toEqual({ current: 3, total: 3 })
    })

    it('calls onStepComplete for each successful step', async () => {
      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
      ])
      await executeMacro(plan, callbacks, undoManager)

      expect(callbacks.stepCompleteCalls).toHaveLength(2)
      expect(callbacks.stepCompleteCalls[0].index).toBe(0)
      expect(callbacks.stepCompleteCalls[1].index).toBe(1)
    })
  })

  describe('failure handling', () => {
    it('halts and rolls back when a step throws', async () => {
      const failingExecutor: StepExecutor = async (step) => {
        if (step.tool === 'sort') {
          throw new Error('Sort operation failed: invalid column')
        }
        return { success: true, data: { tool: step.tool } }
      }

      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
      ])
      const result = await executeMacro(plan, callbacks, undoManager, failingExecutor)

      expect(result.success).toBe(false)
      expect(result.completedSteps).toHaveLength(1)
      expect(result.completedSteps[0].step.tool).toBe('filter')
      expect(result.failedStep).toBeDefined()
      expect(result.failedStep!.index).toBe(1)
      expect(result.failedStep!.step.tool).toBe('sort')
      expect(result.failedStep!.reason).toBe('Sort operation failed: invalid column')
    })

    it('halts and rolls back when a step returns success: false', async () => {
      const failingExecutor: StepExecutor = async (step) => {
        if (step.tool === 'export') {
          return { success: false, error: 'Export target not available' }
        }
        return { success: true, data: { tool: step.tool } }
      }

      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
      ])
      const result = await executeMacro(plan, callbacks, undoManager, failingExecutor)

      expect(result.success).toBe(false)
      expect(result.completedSteps).toHaveLength(2)
      expect(result.failedStep!.index).toBe(2)
      expect(result.failedStep!.step.tool).toBe('export')
      expect(result.failedStep!.reason).toBe('Export target not available')
    })

    it('rolls back the undo group on failure', async () => {
      const failingExecutor: StepExecutor = async () => {
        throw new Error('Something broke')
      }

      const plan = createPlan([createStep('filter')])
      await executeMacro(plan, callbacks, undoManager, failingExecutor)

      expect(undoManager.rollbackGroupCalls).toHaveLength(1)
      expect(undoManager.commitGroupCalls).toHaveLength(0)
    })

    it('handles unknown error types gracefully', async () => {
      const failingExecutor: StepExecutor = async () => {
        throw 'non-error-object' // eslint-disable-line no-throw-literal
      }

      const plan = createPlan([createStep('filter')])
      const result = await executeMacro(plan, callbacks, undoManager, failingExecutor)

      expect(result.success).toBe(false)
      expect(result.failedStep!.reason).toBe('Unknown error')
    })

    it('reports correct step number and tool in failure result', async () => {
      let callCount = 0
      const failAt3: StepExecutor = async (step) => {
        callCount++
        if (callCount === 3) {
          throw new Error('Third step exploded')
        }
        return { success: true, data: { tool: step.tool } }
      }

      const plan = createPlan([
        createStep('step-a'),
        createStep('step-b'),
        createStep('step-c'),
        createStep('step-d'),
      ])
      const result = await executeMacro(plan, callbacks, undoManager, failAt3)

      expect(result.failedStep!.index).toBe(2)
      expect(result.failedStep!.step.tool).toBe('step-c')
      expect(result.failedStep!.reason).toBe('Third step exploded')
    })
  })

  describe('timeout handling', () => {
    it('fails with timeout message when step exceeds 30 seconds', async () => {
      const slowExecutor: StepExecutor = async () => {
        // Simulate a step that never resolves (within test timeframe)
        return new Promise<ToolResult>((resolve) => {
          setTimeout(() => resolve({ success: true }), 60_000)
        })
      }

      const plan = createPlan([createStep('slow-step')])

      // Use fake timers to avoid actually waiting 30s
      vi.useFakeTimers()

      const resultPromise = executeMacro(plan, callbacks, undoManager, slowExecutor)

      // Advance time past the 30s timeout
      await vi.advanceTimersByTimeAsync(31_000)

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.failedStep!.reason).toBe(
        'Step execution timed out after 30 seconds'
      )
      expect(result.failedStep!.index).toBe(0)
      expect(undoManager.rollbackGroupCalls).toHaveLength(1)

      vi.useRealTimers()
    })
  })

  describe('user cancellation', () => {
    it('cancels before first step when shouldCancel returns true immediately', async () => {
      const cancelCallbacks = createMockCallbacks({ cancelAfterStep: 0 })
      // Override: cancel immediately
      cancelCallbacks.shouldCancel = () => true

      const plan = createPlan([createStep('filter'), createStep('sort')])
      const result = await executeMacro(plan, cancelCallbacks, undoManager)

      expect(result.success).toBe(false)
      expect(result.completedSteps).toHaveLength(0)
      expect(result.failedStep!.reason).toBe('User cancelled macro execution')
      expect(result.failedStep!.index).toBe(0)
      expect(undoManager.rollbackGroupCalls).toHaveLength(1)
    })

    it('cancels after completing N steps', async () => {
      const cancelCallbacks = createMockCallbacks({ cancelAfterStep: 2 })

      const plan = createPlan([
        createStep('filter'),
        createStep('sort'),
        createStep('export'),
        createStep('summarize'),
      ])
      const result = await executeMacro(plan, cancelCallbacks, undoManager)

      expect(result.success).toBe(false)
      expect(result.completedSteps).toHaveLength(2)
      expect(result.failedStep!.reason).toBe('User cancelled macro execution')
      expect(result.failedStep!.index).toBe(2)
      expect(undoManager.rollbackGroupCalls).toHaveLength(1)
      expect(undoManager.commitGroupCalls).toHaveLength(0)
    })
  })

  describe('empty plan', () => {
    it('succeeds immediately for plan with no steps', async () => {
      const plan = createPlan([])
      const result = await executeMacro(plan, callbacks, undoManager)

      expect(result.success).toBe(true)
      expect(result.completedSteps).toHaveLength(0)
      expect(undoManager.commitGroupCalls).toHaveLength(1)
    })
  })

  describe('injectable step executor', () => {
    it('uses default executor when none provided', async () => {
      const plan = createPlan([createStep('filter')])
      const result = await executeMacro(plan, callbacks, undoManager)

      expect(result.success).toBe(true)
      expect(result.completedSteps[0].result.data).toEqual({
        tool: 'filter',
        params: { action: 'filter' },
      })
    })

    it('uses custom executor when provided', async () => {
      const customExecutor: StepExecutor = async (step) => ({
        success: true,
        data: { custom: true, tool: step.tool },
      })

      const plan = createPlan([createStep('filter')])
      const result = await executeMacro(plan, callbacks, undoManager, customExecutor)

      expect(result.completedSteps[0].result.data).toEqual({
        custom: true,
        tool: 'filter',
      })
    })
  })
})
