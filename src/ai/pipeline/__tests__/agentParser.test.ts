/**
 * Unit tests for AgentParser stage.
 *
 * Validates: REQ-2.3 (independently testable), REQ-10.1 (backward compat)
 *
 * Tests the claim/pass contract:
 * - Claims when parseMessage returns understood === true (with calls or explanation)
 * - Passes when parseMessage returns understood === false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

// Mock the agent module
vi.mock('@/agent', () => ({
  parseMessage: vi.fn(),
  executeTool: vi.fn(),
  getToolDefinition: vi.fn(),
}))

// Mock supporting modules
vi.mock('@/lib/sheetSort', () => ({
  findHeaderRow: () => 0,
  findLastDataRow: () => 5,
}))

vi.mock('@/engine/spreadsheet', () => ({
  cellToRef: () => ({ row: 0, col: 0 }),
}))

vi.mock('@/lib/deleteRowPreview', () => ({
  findDeleteRowMatches: vi.fn(),
  resolveDeleteRow: vi.fn(),
}))

vi.mock('@/ai/buildContext', () => ({
  buildSpreadsheetContext: () => ({ profile: { columns: [] } }),
}))

vi.mock('@shared/toolRegistry', () => ({
  getToolDefinition: () => ({ category: 'mutate' }),
}))

import { parseMessage, executeTool } from '@/agent'
import { createAgentParserStage } from '../stages/agentParser'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(
  message = 'sort by amount',
  applyPosture?: PipelineContext['applyPosture'],
  mode: PipelineContext['mode'] = 'act',
): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
    applyPosture,
    mode,
  }
}

function makeDeps() {
  return {
    buildExecContext: vi.fn().mockReturnValue({}),
    pushHistory: vi.fn(),
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AgentParser stage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('previews (returns actions, no execute) for a non-allowlisted tool under default posture', async () => {
    const mockParseMessage = vi.mocked(parseMessage)
    mockParseMessage.mockReturnValue({
      understood: true,
      calls: [{ tool: 'sort_column', params: { column: 'Amount', direction: 'desc' }, description: 'Sort by Amount' }],
      explanation: 'Sorting by Amount descending',
    })

    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    const result = await stage.process(makeContext())

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('agent-parser')
    expect(result!.success).toBe(true)
    expect(executeTool).not.toHaveBeenCalled()
    expect(result!.actions).toEqual([expect.objectContaining({ tool: 'sort_column' })])
    expect(result!.message).toMatch(/Apply or Reject/i)
  })

  it('auto + low-risk (format_cells) executes immediately', async () => {
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'format_cells', params: { range: 'A1:C1', bold: true }, description: 'Bold headers' }],
      explanation: 'Bold the header row',
    })
    vi.mocked(executeTool).mockReturnValue({ success: true, message: 'Formatted', modified: 3 })

    const result = await createAgentParserStage(makeDeps()).process(makeContext('bold the headers', 'auto'))

    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'format_cells' }),
      expect.anything(),
    )
    expect(result!.actions).toBeUndefined()
  })

  it('preview + low-risk (format_cells) returns actions, does not execute', async () => {
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'format_cells', params: { range: 'A1:C1', bold: true }, description: 'Bold headers' }],
      explanation: 'Bold the header row',
    })

    const result = await createAgentParserStage(makeDeps()).process(makeContext('bold the headers', 'preview'))

    expect(executeTool).not.toHaveBeenCalled()
    expect(result!.actions).toEqual([expect.objectContaining({ tool: 'format_cells' })])
  })

  it('claims the input when parseMessage returns understood=true with explanation only (ambiguity)', async () => {
    const mockParseMessage = vi.mocked(parseMessage)
    mockParseMessage.mockReturnValue({
      understood: true,
      calls: [],
      explanation: 'Did you mean column A or column B?',
    })

    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    const result = await stage.process(makeContext('sort by something'))

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('agent-parser')
    expect(result!.message).toBe('Did you mean column A or column B?')
  })

  it('passes (returns null) when parseMessage returns understood=false', async () => {
    const mockParseMessage = vi.mocked(parseMessage)
    mockParseMessage.mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })

    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    const result = await stage.process(makeContext('explain my data'))

    expect(result).toBeNull()
  })

  it('passes (returns null) when mode is not act, even if parse would match', async () => {
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'sort_column', params: {}, description: 'Sort' }],
      explanation: 'Sorting',
    })

    const result = await createAgentParserStage(makeDeps()).process(
      makeContext('can you sort by amount?', undefined, 'chat'),
    )

    expect(result).toBeNull()
    expect(parseMessage).not.toHaveBeenCalled()
  })

  it('has the correct stage name', () => {
    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    expect(stage.name).toBe('agent-parser')
  })

  it('executes multiple low-risk tool calls sequentially under auto', async () => {
    const mockParseMessage = vi.mocked(parseMessage)
    mockParseMessage.mockReturnValue({
      understood: true,
      calls: [
        { tool: 'format_cells', params: { range: 'A1', bold: true }, description: 'Bold A1' },
        { tool: 'set_column_width', params: { column: 'A', width: 120 }, description: 'Widen A' },
      ],
      explanation: 'Formatting',
    })

    const mockExecute = vi.mocked(executeTool)
    mockExecute
      .mockReturnValueOnce({ success: true, message: 'Bold A1', modified: 1 })
      .mockReturnValueOnce({ success: true, message: 'Widen A', modified: 1 })

    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    const result = await stage.process(makeContext('bold A1 and widen A', 'auto'))

    expect(result).not.toBeNull()
    expect(result!.success).toBe(true)
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })

  it('runs every step before the undo entry is finalized (one undo reverts all)', async () => {
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [
        { tool: 'format_cells', params: { range: 'A1', bold: true }, description: 'Bold A1' },
        { tool: 'set_column_width', params: { column: 'A', width: 120 }, description: 'Widen A' },
      ],
      explanation: 'Formatting',
    })
    // pushHistory finalizes its diff in a microtask; steps that run after it are lost to undo.
    let historyFinalized = false
    const finalizedAtStep: boolean[] = []
    const run = () => {
      finalizedAtStep.push(historyFinalized)
      return { success: true, message: 'ok', modified: 1 }
    }
    vi.mocked(executeTool).mockImplementation(run)
    const deps = {
      buildExecContext: vi.fn().mockReturnValue({}),
      pushHistory: vi.fn(() => queueMicrotask(() => { historyFinalized = true })),
    }

    await createAgentParserStage(deps).process(makeContext('bold A1 and widen A', 'auto'))

    expect(finalizedAtStep).toEqual([false, false])
  })
})
