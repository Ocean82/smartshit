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
 * - "Analyze my expenses" → deterministic (DeterministicDispatcher, no LLM)
 * - "What does this data mean?" → LLM stream (LLMGateway)
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
    message: 'Your total expenses are $2,450 across 12 categories. Top spending: Rent ($1,200), Groceries ($450).',
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
import { findDeleteRowMatches } from '@/lib/deleteRowPreview'
import { createPipelineRouter } from '../router'
import { createAgentParserStage } from '../stages/agentParser'
import { createTemplateResolverStage } from '../stages/templateResolver'
import { createIntentClassifierStage } from '../stages/intentClassifier'
import { createDeterministicDispatcherStage } from '../stages/deterministicDispatcher'
import { createLLMGatewayStage } from '../stages/llmGateway'

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
    createDeterministicDispatcherStage(),
    createLLMGatewayStage(),
  ])
  return { router, deps }
}

function defaultIntent(rawQuery = ''): ReturnType<typeof parseUserIntent> {
  return {
    intentType: 'unknown',
    targetColumns: [],
    filters: {},
    parameters: {},
    rawQuery,
    confidence: 0.3,
    routingSource: 'regex',
  }
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
    vi.mocked(parseUserIntent).mockReturnValue(defaultIntent())
    vi.mocked(classifyMode).mockReturnValue('chat')
    vi.mocked(chatWithAgentServerStream).mockResolvedValue({
      message: 'Processed by LLM',
      actions: [],
      source: 'llm',
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
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
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
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
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
    // LLMGateway NOT called
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
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

    // IntentClassifier → budget / advise so DeterministicDispatcher claims
    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'budget',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'Analyze my expenses',
      confidence: 0.9,
      routingSource: 'regex',
    })
    vi.mocked(classifyMode).mockReturnValue('advise')

    const { router } = buildPipeline()
    const result = await router.process(makeContext('Analyze my expenses'))

    expect(result.stageName).toBe('deterministic-dispatcher')
    expect(result.success).toBe(true)
    expect(result.message).toContain('expenses')
    // Deterministic path — no LLM streaming
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
  })

  it('"What does this data mean?" → LLM stream (LLMGateway)', async () => {
    // AgentParser doesn't understand
    vi.mocked(parseMessage).mockReturnValue({
      understood: false,
      calls: [],
      explanation: undefined,
    })
    // TemplateResolver doesn't match
    vi.mocked(resolveGalleryTemplate).mockReturnValue(null)

    // General intent / explain mode → deterministic passes → LLMGateway claims
    vi.mocked(parseUserIntent).mockReturnValue(defaultIntent())
    vi.mocked(classifyMode).mockReturnValue('explain')
    vi.mocked(chatWithAgentServerStream).mockResolvedValue({
      message: 'This spreadsheet contains monthly expense data with columns for Category, Amount, and Date. It appears to track household spending over the last 6 months.',
      actions: [],
      source: 'llm',
    })

    const { router } = buildPipeline()
    const result = await router.process(makeContext('What does this data mean?'))

    expect(result.stageName).toBe('llm-gateway')
    expect(result.success).toBe(true)
    expect(result.message).toContain('spreadsheet')
    expect(chatWithAgentServerStream).toHaveBeenCalledTimes(1)
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
    expect(chatWithAgentServerStream).not.toHaveBeenCalled()
  })
})
