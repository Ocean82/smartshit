import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

vi.mock('@/agent', () => ({
  executeToolAsync: vi.fn(),
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

import { executeToolAsync } from '@/agent'
import { createGoalRouterStage } from '../stages/goalRouter'

function makeContext(message: string): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
  }
}

describe('GoalRouter stage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims sum column commands and dispatches apply_formula', async () => {
    vi.mocked(executeToolAsync).mockResolvedValue({ success: true, message: 'Added SUM', modified: 1 })
    const pushHistory = vi.fn()
    const stage = createGoalRouterStage({
      buildExecContext: vi.fn().mockReturnValue({}),
      pushHistory,
    })
    const result = await stage.process(makeContext('sum column B'))
    expect(result?.stageName).toBe('goal-router')
    expect(result?.success).toBe(true)
    expect(result?.message).toContain('Goal: Total')
    expect(result?.suggestions).toEqual(['Total', 'By Category'])
    expect(executeToolAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'apply_formula' }),
      expect.anything(),
    )
  })

  it('passes sort commands through', async () => {
    const stage = createGoalRouterStage({
      buildExecContext: vi.fn(),
      pushHistory: vi.fn(),
    })
    expect(await stage.process(makeContext('sort by amount'))).toBeNull()
  })
})
