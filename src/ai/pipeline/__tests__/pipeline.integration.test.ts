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
 * - "analyze my expenses" → DeterministicDispatcher claims (deterministic path)
 * - "Explain my data" → LLMGateway claims (LLM path)
 * - Unknown gibberish → LLMGateway claims (final fallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  buildSpreadsheetContext: () => ({
    workbookName: 'Test',
    activeSheet: 'Sheet1',
    sheetNames: ['Sheet1'],
    sheetSummaries: [],
    selectedCells: [],
    dimensions: { rows: 1, cols: 1, populatedCells: 0 },
    headers: [],
    sampleRows: [],
    sampleRowsTruncated: false,
    selectionSnapshot: {},
    insights: { headers: [], columnStats: [], outliers: [] },
    profile: { name: 'S', rowCount: 1, colCount: 1, columns: [], detectedPurpose: 'generic' },
  }),
}))

vi.mock('@shared/toolRegistry', () => ({
  getToolDefinition: () => ({ category: 'mutate' }),
}))

// TemplateResolver depends on @/templates
vi.mock('@/templates', () => ({
  resolveGalleryTemplate: vi.fn(),
  executeTemplateTool: vi.fn(),
}))

vi.mock('@/ai/agentClient', () => ({
  chatWithAgentServerStream: vi.fn(),
}))

vi.mock('@shared/intentParser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/intentParser')>()
  return {
    ...actual,
    parseUserIntent: vi.fn(),
    isQueryIntent: vi.fn(() => false),
  }
})

vi.mock('@shared/mode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/mode')>()
  return {
    ...actual,
    classifyMode: vi.fn(),
    isBudgetExplainQuery: vi.fn(() => false),
  }
})

vi.mock('@/ai/analysis/budget', () => ({
  analyzeBudget: vi.fn(() => ({})),
  budgetAnalysisToToolResult: vi.fn(() => ({
    success: true,
    message: 'Here is your expense analysis: Total expenses $2,450...',
  })),
  savingsRecommendation: vi.fn(),
}))

vi.mock('@/ai/analysisTarget', () => ({
  resolveAnalysisTarget: () => ({
    sheet: { cells: {} },
    workbook: { sheets: [], name: 'Test' },
    workbookName: 'Test',
    getComputedValue: () => '',
    getSheetComputedValue: () => '',
    context: {
      insights: {},
      profile: { columns: [], detectedPurpose: 'generic', name: 'S', rowCount: 0, colCount: 0 },
      sampleRows: [],
    },
    isAttached: false,
  }),
}))

vi.mock('@/ai/sheetProfile', () => ({
  buildSheetProfile: () => ({
    name: 'S',
    rowCount: 1,
    colCount: 1,
    columns: [],
    detectedPurpose: 'budget',
    hasHeaders: true,
  }),
}))

vi.mock('@/ai/analysis/reporting', () => ({
  generateReport: vi.fn(),
}))

vi.mock('@/ai/analysis/cleaning', () => ({
  runCleaningSkill: vi.fn(),
}))

vi.mock('@/ai/queryEngine', () => ({
  runQueryFromIntent: vi.fn(),
}))

vi.mock('@/ai/comparison', () => ({
  queryComparison: vi.fn(),
}))

vi.mock('@/ai/responseBuilder', () => ({
  explainOutliers: vi.fn(() => ''),
  formatInsights: vi.fn(() => ''),
  mergeToolResultContent: vi.fn((parts: string[]) => parts.filter(Boolean).join('\n\n')),
}))

vi.mock('@/ai/outliers', () => ({
  isOutlierFollowUp: vi.fn(() => false),
}))

vi.mock('@/ai/mode', () => ({
  isLlmOnlyMode: vi.fn(() => false),
}))

vi.mock('@/auditor', () => ({
  runAudit: vi.fn(() => ({ findings: [], score: 100 })),
  formatAuditForContext: vi.fn(() => ''),
}))

vi.mock('@/ai/contextualSuggestions', () => ({
  getContextualSuggestions: vi.fn(() => []),
}))

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { parseMessage, executeToolAsync } from '@/agent'
import { resolveGalleryTemplate, executeTemplateTool } from '@/templates'
import { chatWithAgentServerStream } from '@/ai/agentClient'
import { parseUserIntent } from '@shared/intentParser'
import { classifyMode } from '@shared/mode'
import { createPipelineRouter } from '../router'
import { createGoalRouterStage } from '../stages/goalRouter'
import { createAgentParserStage } from '../stages/agentParser'
import { createTemplateResolverStage } from '../stages/templateResolver'
import { createIntentClassifierStage } from '../stages/intentClassifier'
import { createDeterministicDispatcherStage } from '../stages/deterministicDispatcher'
import { createLLMGatewayStage } from '../stages/llmGateway'

// ─── Helpers ────────────────────────────────────────────────────────────────

import { defaultIntent, makeContext, makeDeps } from './helpers'

function buildPipeline() {
  const deps = makeDeps()
  const router = createPipelineRouter([
    createGoalRouterStage(deps),
    createAgentParserStage(deps),
    createTemplateResolverStage(deps),
    createIntentClassifierStage(),
    createDeterministicDispatcherStage(),
    createLLMGatewayStage(),
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
    vi.mocked(parseUserIntent).mockReturnValue(defaultIntent())
    vi.mocked(classifyMode).mockReturnValue('chat')
    vi.mocked(chatWithAgentServerStream).mockResolvedValue({
      message: 'Processed by LLM',
      actions: [],
      source: 'llm',
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
    // TemplateResolver and LLMGateway should NOT have been called
    expect(resolveGalleryTemplate).not.toHaveBeenCalled()
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
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
    // LLMGateway should NOT have been called
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
  })

  it('"analyze my expenses" → DeterministicDispatcher claims (deterministic path)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'budget',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'analyze my expenses',
      confidence: 0.9,
      routingSource: 'regex',
    })
    vi.mocked(classifyMode).mockReturnValue('advise')

    const { router } = buildPipeline()
    const result = await router.process(makeContext('analyze my expenses'))

    expect(result.stageName).toBe('deterministic-dispatcher')
    expect(result.success).toBe(true)
    expect(result.message).toContain('expense analysis')
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
  })

  it('"Explain my data" → LLMGateway claims (LLM path)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    vi.mocked(parseUserIntent).mockReturnValue(defaultIntent())
    vi.mocked(classifyMode).mockReturnValue('explain')
    vi.mocked(chatWithAgentServerStream).mockResolvedValue({
      message: 'Your spreadsheet contains financial data with 3 columns...',
      actions: [],
      source: 'llm',
      reasoning: 'Used LLM to explain sheet contents',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Explain my data'))

    expect(result.stageName).toBe('llm-gateway')
    expect(result.success).toBe(true)
    expect(result.message).toContain('financial data')
    expect(chatWithAgentServerStream).toHaveBeenCalledTimes(1)
  })

  it('unknown gibberish → LLMGateway claims (final fallback)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    vi.mocked(parseUserIntent).mockReturnValue(defaultIntent())
    vi.mocked(classifyMode).mockReturnValue('chat')
    vi.mocked(chatWithAgentServerStream).mockResolvedValue({
      message: "I'm not sure what you mean. Could you rephrase?",
      actions: [],
      source: 'llm',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('xyzzy wombat platypus 42'))

    expect(result.stageName).toBe('llm-gateway')
    expect(result.success).toBe(true)
    // IntentClassifier should have enriched context (always passes through)
    expect(chatWithAgentServerStream).toHaveBeenCalledTimes(1)
  })

  it('IntentClassifier enriches context before downstream stages receive it', async () => {
    // AgentParser and TemplateResolver both pass
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'budget',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'analyze my expenses',
      confidence: 0.9,
      routingSource: 'regex',
    })
    vi.mocked(classifyMode).mockReturnValue('advise')

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
    // LLMGateway catches the fallthrough as terminal stage
    vi.mocked(parseUserIntent).mockReturnValue(defaultIntent())
    vi.mocked(classifyMode).mockReturnValue('chat')
    vi.mocked(chatWithAgentServerStream).mockResolvedValue({
      message: 'Recovered via LLM',
      actions: [],
      source: 'llm',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('sort by amount'))

    // Pipeline should recover — LLMGateway catches the fallthrough
    expect(result.stageName).toBe('llm-gateway')
    expect(result.success).toBe(true)
  })
})
