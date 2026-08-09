import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createToolStepExecutor, normalizeStepParams } from '../toolStepExecutor'
import type { ExecutionContext } from '@/agent/executor'

vi.mock('@/agent', () => ({
  executeToolAsync: vi.fn(),
}))

vi.mock('@shared/toolRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/toolRegistry')>()
  return {
    ...actual,
  }
})

import { executeToolAsync } from '@/agent'

describe('normalizeStepParams', () => {
  it('maps columns array to column', () => {
    const params = normalizeStepParams('sort_sheet', { columns: ['Amount', 'Date'] })
    expect(params.column).toBe('Amount')
  })

  it('builds filter condition from values/operators', () => {
    const params = normalizeStepParams('filter', {
      columns: ['B'],
      operators: ['greater-than'],
      values: [500],
    })
    expect(params.column).toBe('B')
    expect(params.condition).toBe('gt')
    expect(params.value).toBe(500)
  })

  it('normalizes filter params when resolved tool is filter_sheet but original was filter', () => {
    const params = normalizeStepParams(
      'filter_sheet',
      { columns: ['Amount'], operators: ['less-than'], values: [10] },
      'filter',
    )
    expect(params.column).toBe('Amount')
    expect(params.condition).toBe('lt')
    expect(params.value).toBe(10)
  })

  it('falls back to the raw operator string when unknown', () => {
    const params = normalizeStepParams('filter', {
      operators: ['contains-text'],
      values: ['Rent'],
    })
    expect(params.condition).toBe('contains-text')
    expect(params.value).toBe('Rent')
  })
})

describe('createToolStepExecutor', () => {
  beforeEach(() => {
    vi.mocked(executeToolAsync).mockReset()
  })

  it('maps sort → sort_sheet and calls executeToolAsync', async () => {
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Sorted',
      modified: 12,
    })

    const ctx = {} as ExecutionContext
    const executor = createToolStepExecutor(() => ctx)
    const result = await executor(
      { tool: 'sort', params: { columns: ['Amount'], direction: 'desc' }, description: 'Sort by Amount' },
      [],
    )

    expect(executeToolAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'sort_sheet',
        params: expect.objectContaining({ column: 'Amount', direction: 'desc' }),
      }),
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ modified: 12, message: 'Sorted' })
  })

  it('maps filter operators/values through to executeToolAsync', async () => {
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Filtered',
      modified: 4,
    })

    const executor = createToolStepExecutor(() => ({} as ExecutionContext))
    await executor(
      {
        tool: 'filter',
        params: { columns: ['Amount'], operators: ['greater-than'], values: [100] },
        description: 'Filter Amount > 100',
      },
      [],
    )

    expect(executeToolAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'filter',
        params: expect.objectContaining({
          column: 'Amount',
          condition: 'gt',
          value: 100,
        }),
      }),
      expect.anything(),
    )
  })

  it('passes unknown filter operators through without throwing', async () => {
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Filtered',
      modified: 1,
    })

    const executor = createToolStepExecutor(() => ({} as ExecutionContext))
    await executor(
      {
        tool: 'filter',
        params: { columns: ['Category'], operators: ['matches-regex'], values: ['^Food'] },
        description: 'Filter Category',
      },
      [],
    )

    expect(executeToolAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          condition: 'matches-regex',
          value: '^Food',
        }),
      }),
      expect.anything(),
    )
  })

  it('maps format → format_cells', async () => {
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Formatted',
      modified: 3,
    })

    const executor = createToolStepExecutor(() => ({} as ExecutionContext))
    await executor(
      { tool: 'format', params: { bgColor: '#FEE2E2' }, description: 'Highlight' },
      [],
    )

    expect(executeToolAsync).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'format_cells' }),
      expect.anything(),
    )
  })

  it('converts failed ExecutionResult to ToolResult error', async () => {
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: false,
      message: 'Column not found',
      modified: 0,
    })

    const executor = createToolStepExecutor(() => ({} as ExecutionContext))
    const result = await executor(
      { tool: 'sort_sheet', params: { column: 'Z' }, description: 'Sort' },
      [],
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Column not found')
  })
})
