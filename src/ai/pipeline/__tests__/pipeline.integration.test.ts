/**
 * Integration test: full pipeline end-to-end.
 *
 * Validates: REQ-10.1 (agent-parser commands), REQ-10.2 (template commands),
 * REQ-10.3 (LLM queries), REQ-10.4 (deterministic skill outputs).
 *
 * Assembles the FULL pipeline with all stages and verifies which stage
 * handles each input type:
 * - "sort by amount" → AgentParser claims (stage 1)
 * - "Create a monthly budget" → TemplateResolver claims (stage 2)
 * - "analyze my expenses" → BrainDispatcher claims (stage 4 — deterministic path)
 * - "Explain my data" → BrainDispatcher claims (stage 5 — LLM path)
 * - Unknown gibberish → BrainDispatcher claims (final fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

// ─── Mock external dependencies ─────────────────────────────────────────────

// AgentParser depends on @/agent
vi.mock('@/agent', () => ({
  parseMessage: vi.fn(),
  executeToolAsync: vi.fn(),
}))

// AgentParser supporting modules
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

// TemplateResolver depends on @/templates
vi.mock('@/templates', () => ({
  resolveGalleryTemplate: vi.fn(),
  executeTemplateTool: vi.fn(),
}))

// BrainDispatcher depends on @/ai/brain
vi.mock('@/ai/brain', () => ({
  processMessage: vi.fn(),
}))

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { parseMessage, executeToolAsync } from '@/agent'
import { resolveGalleryTemplate, executeTemplateTool } from '@/templates'
import { processMessage } from '@/ai/brain'
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Pipeline Integration: end-to-end routing', () => {
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

  it('"sort by amount" → AgentParser claims (stage 1)', async () => {
    // AgentParser understands this command
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'sort_column', params: { column: 'Amount', direction: 'asc' }, description: 'Sort by Amount' }],
      explanation: 'Sorting by Amount ascending',
    })
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Sorted by Amount ascending',
      modified: 10,
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('sort by amount'))

    expect(result.stageName).toBe('agent-parser')
    expect(result.success).toBe(true)
    // TemplateResolver and BrainDispatcher should NOT have been called
    expect(resolveGalleryTemplate).not.toHaveBeenCalled()
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('"Create a monthly budget" → TemplateResolver claims (stage 2)', async () => {
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
      message: 'Monthly Budget template applied',
      modified: 15,
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Create a monthly budget'))

    expect(result.stageName).toBe('template-resolver')
    expect(result.success).toBe(true)
    expect(result.message).toContain('Monthly Budget template applied')
    // BrainDispatcher should NOT have been called
    expect(processMessage).not.toHaveBeenCalled()
  })

  it('"analyze my expenses" → BrainDispatcher claims (stage 4 — deterministic path)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // BrainDispatcher handles it (deterministic skill internally)
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'Here is your expense analysis: Total expenses $2,450...',
      toolUsed: 'budget',
      suggestions: ['Show me spending by category', 'Compare to last month'],
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('analyze my expenses'))

    expect(result.stageName).toBe('brain-dispatcher')
    expect(result.success).toBe(true)
    expect(result.message).toContain('expense analysis')
    expect(processMessage).toHaveBeenCalledTimes(1)
  })

  it('"Explain my data" → BrainDispatcher claims (stage 5 — LLM path)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // BrainDispatcher handles it (LLM path internally)
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'Your spreadsheet contains financial data with 3 columns...',
      toolUsed: 'llm',
      reasoning: 'Used LLM to explain sheet contents',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Explain my data'))

    expect(result.stageName).toBe('brain-dispatcher')
    expect(result.success).toBe(true)
    expect(result.message).toContain('financial data')
    expect(processMessage).toHaveBeenCalledTimes(1)
  })

  it('unknown gibberish → BrainDispatcher claims (final fallback)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // BrainDispatcher always claims as terminal stage (LLM fallback)
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: "I'm not sure what you mean. Could you rephrase?",
      toolUsed: 'llm',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('xyzzy wombat platypus 42'))

    expect(result.stageName).toBe('brain-dispatcher')
    expect(result.success).toBe(true)
    // IntentClassifier should have enriched context (always passes through)
    expect(processMessage).toHaveBeenCalledTimes(1)
  })

  it('IntentClassifier enriches context before BrainDispatcher receives it', async () => {
    // AgentParser and TemplateResolver both pass
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // Capture the input passed to processMessage to verify context was enriched
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'Budget analysis result',
    })

    const { router } = buildPipeline()
    const context = makeContext('analyze my expenses')
    await router.process(context)

    // IntentClassifier should have enriched the context
    expect(context.intent).toBeDefined()
    expect(context.mode).toBeDefined()
  })

  it('pipeline stages execute in priority order', async () => {
    // Both AgentParser AND TemplateResolver would claim, but AgentParser wins
    vi.mocked(parseMessage).mockReturnValue({
      understood: true,
      calls: [{ tool: 'set_cell', params: { cell: 'A1', value: 'Budget' }, description: 'Set A1' }],
      explanation: 'Setting cell',
    })
    vi.mocked(executeToolAsync).mockResolvedValue({
      success: true,
      message: 'Set A1',
      modified: 1,
    })
    vi.mocked(resolveGalleryTemplate).mockReturnValue({
      name: 'budget',
      label: 'Budget',
      prompt: 'Create a budget',
      tool: 'template_budget',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Create a budget'))

    // AgentParser wins because it's first in pipeline
    expect(result.stageName).toBe('agent-parser')
    // TemplateResolver never called because AgentParser already claimed
    expect(resolveGalleryTemplate).not.toHaveBeenCalled()
  })

  it('pipeline continues gracefully when a stage throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // AgentParser throws an error
    vi.mocked(parseMessage).mockImplementation(() => {
      throw new Error('Parser crashed')
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)
    // BrainDispatcher catches it
    vi.mocked(processMessage).mockResolvedValue({
      success: true,
      message: 'Recovered via brain',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('sort by amount'))

    // Pipeline should recover — BrainDispatcher catches the fallthrough
    expect(result.stageName).toBe('brain-dispatcher')
    expect(result.success).toBe(true)
  })
})
