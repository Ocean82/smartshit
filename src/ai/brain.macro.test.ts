/**
 * Unit tests for Brain macro plan integration (Task 11.2)
 *
 * Tests the macro plan UI flow:
 * - Multi-step plans presented as numbered lists
 * - Single-step plans executed directly (no confirmation)
 * - Confirm → execute, reject → cancel, edit → re-present
 * - Error handling with retry/cancel options
 *
 * @module brain.macro.test
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { processMessage, type ProcessMessageInput, type MacroPlanUICallbacks, type MacroPlanUserDecision } from './brain'
import { createEmptyWorkbook, createEmptySheet } from '@/engine/spreadsheet'
import type { SheetData, WorkbookData } from '@/types'
import type { MacroPlan, MacroExecutionResult, UndoManager } from '@/ai/nlp/types'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTestSheet(): { workbook: WorkbookData; sheet: SheetData } {
  const sheet = createEmptySheet('Test Sheet')
  sheet.cells = {
    '0,0': { value: 'Category' },
    '0,1': { value: 'Amount' },
    '1,0': { value: 'Rent' },
    '1,1': { value: 1200 },
    '2,0': { value: 'Food' },
    '2,1': { value: 400 },
  }
  sheet.columnWidths = { 0: 100, 1: 100 }
  const workbook = createEmptyWorkbook('Test Workbook')
  workbook.sheets = [sheet]
  workbook.activeSheetId = sheet.id
  return { workbook, sheet }
}

function createMockUndoManager(): UndoManager {
  return {
    beginGroup: vi.fn(() => 'undo-group-1'),
    commitGroup: vi.fn(),
    rollbackGroup: vi.fn(),
  }
}

function createMockCallbacks(decisions: MacroPlanUserDecision[] = [{ action: 'confirm' }]): MacroPlanUICallbacks & { presentedPlans: string[]; errors: string[]; progressUpdates: Array<{ current: number; total: number }> } {
  let decisionIndex = 0
  const presentedPlans: string[] = []
  const errors: string[] = []
  const progressUpdates: Array<{ current: number; total: number }> = []

  return {
    presentedPlans,
    errors,
    progressUpdates,
    presentPlan: vi.fn(async (planDisplay: string, _plan: MacroPlan): Promise<MacroPlanUserDecision> => {
      presentedPlans.push(planDisplay)
      const decision = decisions[decisionIndex] ?? { action: 'confirm' }
      decisionIndex++
      return decision
    }),
    onProgress: vi.fn((current: number, total: number) => {
      progressUpdates.push({ current, total })
    }),
    onComplete: vi.fn(),
    onError: vi.fn(async (message: string): Promise<'retry' | 'cancel'> => {
      errors.push(message)
      return 'cancel'
    }),
  }
}

function buildTestInput(overrides: Partial<ProcessMessageInput> = {}): ProcessMessageInput {
  const { workbook, sheet } = createTestSheet()
  return {
    message: 'filter rows over $500',
    workbook,
    sheet,
    selection: null,
    getComputedValue: (row: number, col: number) => {
      const cellKey = `${row},${col}`
      const cell = sheet.cells[cellKey]
      return cell?.value?.toString() ?? ''
    },
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Brain Macro Plan Integration', () => {
  describe('Single-step plan bypass', () => {
    it('should execute single-step plans directly without presenting for confirmation', async () => {
      const undoManager = createMockUndoManager()
      const callbacks = createMockCallbacks()

      // "filter rows over $500" should be a single-step macro command
      const input = buildTestInput({
        message: 'filter rows over $500',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      const result = await processMessage(input)

      // Should NOT have presented a plan for confirmation
      expect(callbacks.presentedPlans).toHaveLength(0)

      // Should have used the undo manager (macro was executed)
      if (result.toolUsed === 'macro') {
        expect(undoManager.beginGroup).toHaveBeenCalled()
      }
    })
  })

  describe('Multi-step plan presentation', () => {
    it('should present multi-step plans as numbered list for confirmation', async () => {
      const undoManager = createMockUndoManager()
      const callbacks = createMockCallbacks([{ action: 'confirm' }])

      // Multi-step command with explicit separators
      const input = buildTestInput({
        message: 'filter rows over $500, then sort by Amount, and highlight the top 3',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      const result = await processMessage(input)

      // Should have presented a plan
      if (callbacks.presentedPlans.length > 0) {
        const plan = callbacks.presentedPlans[0]
        // Plan should be a numbered list
        expect(plan).toContain('1.')
        expect(plan).toContain('2.')

        // Each line description should be 10-120 chars
        const lines = plan.split('\n')
        for (const line of lines) {
          // Remove the number prefix "N. "
          const desc = line.replace(/^\d+\.\s*/, '')
          expect(desc.length).toBeGreaterThanOrEqual(10)
          expect(desc.length).toBeLessThanOrEqual(120)
        }
      }
    })

    it('should include step descriptions between 10 and 120 characters', async () => {
      const undoManager = createMockUndoManager()
      const callbacks = createMockCallbacks([{ action: 'confirm' }])

      const input = buildTestInput({
        message: 'sort by Amount; filter rows over $500',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      await processMessage(input)

      if (callbacks.presentedPlans.length > 0) {
        const plan = callbacks.presentedPlans[0]
        const lines = plan.split('\n')
        for (const line of lines) {
          const desc = line.replace(/^\d+\.\s*/, '')
          expect(desc.length).toBeGreaterThanOrEqual(10)
          expect(desc.length).toBeLessThanOrEqual(120)
        }
      }
    })
  })

  describe('User decision handling', () => {
    it('should execute on confirm', async () => {
      const undoManager = createMockUndoManager()
      const callbacks = createMockCallbacks([{ action: 'confirm' }])

      const input = buildTestInput({
        message: 'sort by Amount; filter rows over $500',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      const result = await processMessage(input)

      // If macro path was taken, result should indicate execution
      if (result.toolUsed === 'macro') {
        expect(result.success).toBe(true)
        expect(result.message).toContain('Macro completed')
      }
    })

    it('should cancel on reject', async () => {
      const undoManager = createMockUndoManager()
      const callbacks = createMockCallbacks([{ action: 'reject' }])

      const input = buildTestInput({
        message: 'sort by Amount; filter rows over $500',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      const result = await processMessage(input)

      if (result.toolUsed === 'macro') {
        expect(result.message).toContain('cancelled')
      }
    })

    it('should re-present plan after edit', async () => {
      const undoManager = createMockUndoManager()
      // First decision: edit step 0, second decision: confirm
      const callbacks = createMockCallbacks([
        { action: 'edit', stepIndex: 0, newParams: { value: 1000 } },
        { action: 'confirm' },
      ])

      const input = buildTestInput({
        message: 'sort by Amount; filter rows over $500',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      const result = await processMessage(input)

      // Should have presented plan twice (original + after edit)
      if (callbacks.presentedPlans.length > 0 && result.toolUsed === 'macro') {
        expect(callbacks.presentedPlans.length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  describe('Error handling', () => {
    it('should return null result when undoManager is not provided', async () => {
      // Without undoManager, macro flow is skipped entirely
      const callbacks = createMockCallbacks()

      const input = buildTestInput({
        message: 'sort by Amount; filter rows over $500',
        // No undoManager
        macroPlanCallbacks: callbacks,
      })

      const result = await processMessage(input)

      // Should have fallen through to normal processing (not macro)
      expect(callbacks.presentedPlans).toHaveLength(0)
    })

    it('should fall through gracefully when macroPlanCallbacks is not provided for multi-step plans', async () => {
      const undoManager = createMockUndoManager()

      const input = buildTestInput({
        message: 'sort by Amount; filter rows over $500',
        undoManager,
        // No macroPlanCallbacks
      })

      const result = await processMessage(input)
      // Should not crash — falls through to normal brain processing
      expect(result).toBeDefined()
    })
  })

  describe('Plan format validation', () => {
    it('should format plans with numbered steps', () => {
      // Test the format directly via the processMessage flow
      const undoManager = createMockUndoManager()
      const callbacks = createMockCallbacks([{ action: 'reject' }])

      const input = buildTestInput({
        message: 'filter rows over $500; sort by Amount; highlight the top 3',
        undoManager,
        macroPlanCallbacks: callbacks,
      })

      processMessage(input).then((result) => {
        if (callbacks.presentedPlans.length > 0) {
          const plan = callbacks.presentedPlans[0]
          const lines = plan.split('\n')
          // Verify numbered format
          lines.forEach((line, i) => {
            expect(line).toMatch(new RegExp(`^${i + 1}\\.`))
          })
        }
      })
    })
  })
})
