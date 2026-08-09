/**
 * Unit tests for the MacroPlanner pipeline stage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

vi.mock('@/agent', () => ({
  parseMessage: vi.fn(),
}))

vi.mock('@/lib/sheetSort', () => ({
  findHeaderRow: () => 0,
  findLastDataRow: () => 5,
}))

vi.mock('@/engine/spreadsheet', () => ({
  cellToRef: () => ({ row: 0, col: 0 }),
}))

vi.mock('@/ai/buildContext', () => ({
  buildSpreadsheetContext: () => ({
    profile: { columns: [] },
  }),
}))

vi.mock('@/ai/nlp/macroPlanner', () => ({
  segmentClauses: vi.fn(),
}))

import { parseMessage } from '@/agent'
import { segmentClauses } from '@/ai/nlp/macroPlanner'
import { createMacroPlannerStage } from '../stages/macroPlanner'

function makeContext(message: string): PipelineContext {
  return {
    message,
    workbook: { sheets: [{ id: 's1', name: 'Sheet1', cells: {} }], name: 'Test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
  }
}

describe('createMacroPlannerStage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null for a single-clause message', async () => {
    vi.mocked(segmentClauses).mockReturnValue(['sort by amount'])
    const stage = createMacroPlannerStage({ buildExecContext: () => ({} as never) })
    const result = await stage.process(makeContext('sort by amount'))
    expect(result).toBeNull()
    expect(parseMessage).not.toHaveBeenCalled()
  })

  it('claims multi-clause messages as a pending execute_macro action', async () => {
    vi.mocked(segmentClauses).mockReturnValue([
      'sort by amount descending',
      'bold the headers',
    ])
    vi.mocked(parseMessage)
      .mockReturnValueOnce({
        understood: true,
        calls: [{ tool: 'sort_sheet', params: { column: 'Amount', direction: 'desc' }, description: 'Sort by Amount desc' }],
      })
      .mockReturnValueOnce({
        understood: true,
        calls: [{ tool: 'format_cells', params: { bold: true }, description: 'Bold headers' }],
      })

    const stage = createMacroPlannerStage({ buildExecContext: () => ({} as never) })
    const result = await stage.process(makeContext('sort by amount descending then bold the headers'))

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('macro-planner')
    expect(result!.success).toBe(true)
    expect(result!.message).toContain('Click Apply to run these as one undoable group.')
    expect(result!.actions).toHaveLength(1)
    expect(result!.actions![0].tool).toBe('execute_macro')
    expect(result!.actions![0].params.steps).toHaveLength(2)
    expect(result!.metadata?.toolUsed).toBe('macro')
  })

  it('passes through when any clause is not understood', async () => {
    vi.mocked(segmentClauses).mockReturnValue(['sort by amount', 'do something weird'])
    vi.mocked(parseMessage)
      .mockReturnValueOnce({
        understood: true,
        calls: [{ tool: 'sort_sheet', params: { column: 'Amount' }, description: 'Sort' }],
      })
      .mockReturnValueOnce({
        understood: false,
        calls: [],
      })

    const stage = createMacroPlannerStage({ buildExecContext: () => ({} as never) })
    const result = await stage.process(makeContext('sort by amount then do something weird'))
    expect(result).toBeNull()
  })
})
