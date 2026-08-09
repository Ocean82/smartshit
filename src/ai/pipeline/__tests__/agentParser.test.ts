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
  executeToolAsync: vi.fn(),
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

import { parseMessage, executeToolAsync } from '@/agent'
import { createAgentParserStage } from '../stages/agentParser'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(message = 'sort by amount'): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
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

  it('claims the input when parseMessage returns understood=true with tool calls', async () => {
    const mockParseMessage = vi.mocked(parseMessage)
    mockParseMessage.mockReturnValue({
      understood: true,
      calls: [{ tool: 'sort_column', params: { column: 'Amount', direction: 'desc' }, description: 'Sort by Amount' }],
      explanation: 'Sorting by Amount descending',
    })

    const mockExecute = vi.mocked(executeToolAsync)
    mockExecute.mockResolvedValue({ success: true, message: 'Sorted', modified: 5 })

    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    const result = await stage.process(makeContext())

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('agent-parser')
    expect(result!.success).toBe(true)
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

  it('has the correct stage name', () => {
    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    expect(stage.name).toBe('agent-parser')
  })

  it('executes multiple tool calls sequentially', async () => {
    const mockParseMessage = vi.mocked(parseMessage)
    mockParseMessage.mockReturnValue({
      understood: true,
      calls: [
        { tool: 'set_cell', params: { cell: 'A1', value: '10' }, description: 'Set A1' },
        { tool: 'set_cell', params: { cell: 'A2', value: '20' }, description: 'Set A2' },
      ],
      explanation: 'Setting cells',
    })

    const mockExecute = vi.mocked(executeToolAsync)
    mockExecute
      .mockResolvedValueOnce({ success: true, message: 'Set A1', modified: 1 })
      .mockResolvedValueOnce({ success: true, message: 'Set A2', modified: 1 })

    const deps = makeDeps()
    const stage = createAgentParserStage(deps)
    const result = await stage.process(makeContext('set A1 to 10 and A2 to 20'))

    expect(result).not.toBeNull()
    expect(result!.success).toBe(true)
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })
})
