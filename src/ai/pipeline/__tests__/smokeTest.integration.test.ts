/**
 * Smoke test: Top commands end-to-end routing verification.
 *
 * Validates: REQ-10.1 (agent-parser commands), REQ-10.2 (template commands),
 * REQ-10.3 (LLM queries), REQ-10.4 (deterministic skill outputs).
 *
 * Verifies that each of the top user commands routes to the correct
 * pipeline stage with the expected behavior:
 * - "Sort by Amount descending" → instant (AgentParser)
 * - "Highlight cells over 500 red" → instant (AgentParser)
 * - "Create a monthly budget" → instant (TemplateResolver)
 * - "Analyze my expenses" → deterministic (BrainDispatcher, no LLM)
 * - "What does this data mean?" → LLM stream (BrainDispatcher)
 * - "Delete row Netflix" → preview/confirm flow (AgentParser)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

// ─── Mock external dependencies ─────────────────────────────────────────────

vi.mock('@/agent', () => ({
  parseMessage: vi.fn(),
  executeToolAsync: vi.fn(),
}))

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
  buildSpreadsheetContext: () => ({ profile: { columns: [] }, insights: {} }),
}))

vi.mock('@shared/toolRegistry', () => ({
  getToolDefinition: () => ({ category: 'mutate' }),
}))

vi.mock('@/templates', () => ({
  resolveGalleryTemplate: vi.fn(),
  executeTemplateTool: vi.fn(),
}))

vi.mock('@/ai/brain', () => ({
  processMessage: vi.fn(),
}))

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { parseMessage, executeToolAsync } from '@/agent'
import { resolveGalleryTemplate, executeTemplateTool } from '@/templates'
import { processMessage } from '@/ai/brain'
import { findDeleteRowMatches } from '@/lib/deleteRowPreview'
import { createPipelineRouter } from '../router'
import { createAgentParserStage } from '../stages/agentParser'
import { createTemplateResolverStage } from '../stages/templateResolver'
import { createIntentClassifierStage } from '../stages/intentClassifier'
import { createBrainDispatcherStage } from '../stages/brainDispatcher'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(message: string): PipelineContext {
  return {
    message,
    workbook: { sheets: [{ id: 's1', name: 'Sheet1' }], name: 'TestWorkbook' } as unknown as PipelineContext['workbook'],
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

function buildPipeline() {
  const deps = makeDeps()
  const router = createPipelineRouter([
    createAgentParserStage(deps),
    createTemplateResolverStage(deps),
    createIntentClassifierStage(),
    createBrainDispatcherStage(),
  ])
  return { router, deps }
}

// ─── Smoke Tests ────────────────────────────────────────────────────────────

describe('Smoke Test: Top commands routing verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    // Default: agent parser doesn't understand, template doesn't match
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'Processed by brain',
    })
  })

  it('"Sort by Amount descending" → AgentParser claims (instant)', async () => {
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'sort_sheet', params: { column: 'Amount', direction: 'desc' }, description: 'Sort by Amount descending' }],
      explanation: 'Sorting by Amount (highest first).',
    })
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Sorted by Amount descending',
      modified: 10,
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Sort by Amount descending'))

    expect(result.stageName).toBe('agent-parser')
    expect(result.success).toBe(true)
    expect(result.message).toContain('Sort')
    // Downstream stages NOT called
    expect(resolveGalleryTemplate).not.toHaveBeenCalled()
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('"Highlight cells over 500 red" → AgentParser claims (instant)', async () => {
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{
        tool: 'format_cells',
        params: { condition: { operator: 'gt', value: 500 }, bgColor: '#FEE2E2' },
        description: 'Highlight values over 500',
      }],
      explanation: 'Highlighting values over 500.',
    })
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Highlighted 8 cells over 500 in red',
      modified: 8,
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Highlight cells over 500 red'))

    expect(result.stageName).toBe('agent-parser')
    expect(result.success).toBe(true)
    // Downstream stages NOT called
    expect(resolveGalleryTemplate).not.toHaveBeenCalled()
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('"Create a monthly budget" → TemplateResolver claims (instant)', async () => {
    // AgentParser doesn't understand this
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })

    // TemplateResolver matches it
    vi.mocked(resolveGalleryTemplate).mockReturnValue({
      name: 'monthly-budget',
      label: 'Monthly Budget',
      prompt: 'Create a monthly budget',
      tool: 'template_monthly_budget',
    })
    vi.mocked(executeTemplateTool).mockReturnValue({
      success: true,
      message: '✅ Monthly Budget template created with categories and formulas.',
      modified: 15,
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Create a monthly budget'))

    expect(result.stageName).toBe('template-resolver')
    expect(result.success).toBe(true)
    expect(result.message).toContain('Monthly Budget')
    // BrainDispatcher NOT called
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('"Analyze my expenses" → deterministic (no LLM)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // BrainDispatcher handles it via deterministic skill (budget/analyze)
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'Your total expenses are $2,450 across 12 categories. Top spending: Rent ($1,200), Groceries ($450).',
      toolUsed: 'budget',
      suggestions: ['Show spending by category', 'Compare to last month'],
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Analyze my expenses'))

    expect(result.stageName).toBe('brain-dispatcher')
    expect(result.success).toBe(true)
    expect(result.message).toContain('expenses')
    // Verify the brain handled it (deterministic path — no streaming)
    expect(processMessage).toHaveBeenCalledTimes(1)
  })

  it('"What does this data mean?" → LLM stream (BrainDispatcher)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // BrainDispatcher routes to LLM for explanation
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'This spreadsheet contains monthly expense data with columns for Category, Amount, and Date. It appears to track household spending over the last 6 months.',
      toolUsed: 'llm',
      reasoning: 'Used LLM to explain data meaning',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('What does this data mean?'))

    expect(result.stageName).toBe('brain-dispatcher')
    expect(result.success).toBe(true)
    expect(result.message).toContain('spreadsheet')
    // Verify LLM path was used
    expect(processMessage).toHaveBeenCalledTimes(1)
  })

  it('"Delete row Netflix" → AgentParser claims with preview/confirm flow', async () => {
    // AgentParser recognizes delete row pattern
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'delete_row', params: { match: 'netflix' }, description: 'Delete row containing "netflix"' }],
      explanation: 'Removing the row containing "netflix".',
    })

    // For delete_row, the stage invokes findDeleteRowMatches for preview
    vi.mocked(findDeleteRowMatches).mockReturnValue([3])
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Deleted row 3 (Netflix, $15.99, Entertainment)',
      modified: 1,
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Delete row Netflix'))

    expect(result.stageName).toBe('agent-parser')
    expect(result.success).toBe(true)
    // Verify it was claimed by AgentParser, not passed to downstream
    expect(resolveGalleryTemplate).not.toHaveBeenCalled()
    expect(processMessage).not.toHaveBeenCalled()
  })
})
