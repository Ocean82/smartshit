import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'
import type { ApplyPosture } from '@/types'

vi.mock('@/agent', () => ({
  executeTool: vi.fn(),
}))

vi.mock('@/ai/buildContext', () => ({
  buildSpreadsheetContext: () => ({
    profile: {
      name: 'S',
      rowCount: 5,
      colCount: 3,
      detectedPurpose: 'budget',
      hasHeaders: true,
      hasTotalsRow: false,
      columns: [
        { name: 'Category', column: 'A', dtype: 'string', role: 'category', nonNullCount: 4, nullCount: 0, uniqueCount: 3, sampleValues: ['Rent'] },
        { name: 'Amount', column: 'B', dtype: 'number', role: 'amount', nonNullCount: 4, nullCount: 0, uniqueCount: 4, sampleValues: [100] },
      ],
    },
  }),
}))

vi.mock('@shared/toolRegistry', () => ({
  getToolDefinition: () => ({ category: 'mutate' }),
}))

// Mock goal matching/execution so the test controls exactly which actions a
// matched goal emits — the posture decision is what we're exercising here.
vi.mock('@/ai/goals', () => ({
  matchGoal: vi.fn(() => ({ status: 'matched', goal: { id: 'total', title: 'Total' }, explain: 'Add a total' })),
  executeGoal: vi.fn(),
  listSuggestedGoals: vi.fn(() => []),
}))

import { executeTool } from '@/agent'
import { executeGoal } from '@/ai/goals'
import { createGoalRouterStage } from '../stages/goalRouter'

function makeContext(message: string, applyPosture?: ApplyPosture): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
    applyPosture,
  }
}

function makeDeps() {
  return {
    buildExecContext: vi.fn().mockReturnValue({}),
    pushHistory: vi.fn(),
  }
}

describe('GoalRouter stage — posture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('auto + low-risk action → executes immediately', async () => {
    vi.mocked(executeGoal).mockReturnValue({
      message: 'Format headers',
      actions: [{ tool: 'format_cells', params: { range: 'A1:C1', bold: true }, description: 'Bold headers' }],
    } as never)
    vi.mocked(executeTool).mockReturnValue({ success: true, message: 'done', modified: 3 })

    const result = await createGoalRouterStage(makeDeps()).process(makeContext('bold the headers', 'auto'))

    expect(result?.stageName).toBe('goal-router')
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'format_cells' }),
      expect.anything(),
    )
    expect(result?.actions).toBeUndefined()
  })

  it('preview + low-risk action → returns actions, does not execute', async () => {
    vi.mocked(executeGoal).mockReturnValue({
      message: 'Format headers',
      actions: [{ tool: 'format_cells', params: { range: 'A1:C1', bold: true }, description: 'Bold headers' }],
    } as never)

    const result = await createGoalRouterStage(makeDeps()).process(makeContext('bold the headers', 'preview'))

    expect(executeTool).not.toHaveBeenCalled()
    expect(result?.actions).toEqual([
      expect.objectContaining({ tool: 'format_cells' }),
    ])
    expect(result?.message).toMatch(/Apply or Reject/i)
    expect(result?.metadata?.preview).toBe(true)
  })

  it('defaults to preview when posture is absent', async () => {
    vi.mocked(executeGoal).mockReturnValue({
      message: 'Format headers',
      actions: [{ tool: 'format_cells', params: { range: 'A1:C1', bold: true }, description: 'Bold headers' }],
    } as never)

    const result = await createGoalRouterStage(makeDeps()).process(makeContext('bold the headers'))

    expect(executeTool).not.toHaveBeenCalled()
    expect(result?.actions?.length).toBe(1)
  })

  it('auto + mixed batch (one non-allowlisted) → previews whole batch', async () => {
    vi.mocked(executeGoal).mockReturnValue({
      message: 'Format then sum',
      actions: [
        { tool: 'format_cells', params: {}, description: 'Bold headers' },
        { tool: 'apply_formula', params: {}, description: 'Sum column' },
      ],
    } as never)

    const result = await createGoalRouterStage(makeDeps()).process(makeContext('bold headers and total', 'auto'))

    expect(executeTool).not.toHaveBeenCalled()
    expect(result?.actions?.length).toBe(2)
    expect(result?.metadata?.preview).toBe(true)
  })
})
