/**
 * Unit tests for DeterministicDispatcher stage.
 *
 * Validates: REQ-6.1, REQ-6.2, REQ-6.3, REQ-6.4
 *
 * Tests the dispatch/pass contract:
 * - Claims when intent maps to a built-in skill
 * - Returns null when no skill handles the intent
 * - Uses context.intent and context.mode set by IntentClassifier
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'
import type { AnalysisTarget } from '@/ai/analysisTarget'
import type { SheetInsights } from '@/ai/sheetInsights'

// Mock skill modules
vi.mock('@/ai/sheetProfile', () => ({
  buildSheetProfile: vi.fn(() => ({
    name: 'Sheet1',
    rowCount: 10,
    colCount: 5,
    detectedPurpose: 'general',
    columns: [],
  })),
}))

vi.mock('@/ai/analysis/budget', () => ({
  analyzeBudget: vi.fn(() => ({ summary: 'Budget analysis', overspendingCategories: [] })),
  budgetAnalysisToToolResult: vi.fn((analysis: unknown) => ({
    success: true,
    message: 'Budget analysis result',
    suggestions: ['Track spending'],
  })),
  savingsRecommendation: vi.fn(() => ({
    success: true,
    message: 'Savings recommendation',
    suggestions: ['Save more'],
  })),
}))

vi.mock('@/ai/analysis/reporting', () => ({
  generateReport: vi.fn(() => ({
    success: true,
    message: 'Generated report',
    suggestions: ['Export as PDF'],
  })),
}))

vi.mock('@/ai/analysis/cleaning', () => ({
  runCleaningSkill: vi.fn(() => ({
    success: true,
    message: 'Cleaned 3 cells',
    actions: [{ tool: 'clean', params: {}, description: 'Clean cells' }],
  })),
}))

vi.mock('@/ai/queryEngine', () => ({
  runQueryFromIntent: vi.fn(() => ({
    success: true,
    message: 'Query result: total is $500',
    suggestions: ['Filter further'],
  })),
}))

vi.mock('@/ai/comparison', () => ({
  queryComparison: vi.fn(() => ({
    success: true,
    message: 'Comparison result',
    suggestions: ['Compare another sheet'],
  })),
}))

vi.mock('@/ai/responseBuilder', () => ({
  explainOutliers: vi.fn(() => 'These values are outliers because...'),
}))

vi.mock('@/ai/outliers', () => ({
  isOutlierFollowUp: vi.fn(() => false),
}))

vi.mock('@shared/intentParser', () => ({
  isQueryIntent: vi.fn(() => false),
}))

vi.mock('@shared/mode', () => ({
  isBudgetExplainQuery: vi.fn(() => false),
}))

import { createDeterministicDispatcherStage } from '../stages/deterministicDispatcher'
import { isOutlierFollowUp } from '@/ai/outliers'
import { isQueryIntent } from '@shared/intentParser'
import { isBudgetExplainQuery } from '@shared/mode'
import { runCleaningSkill } from '@/ai/analysis/cleaning'
import { generateReport } from '@/ai/analysis/reporting'
import { queryComparison } from '@/ai/comparison'
import { runQueryFromIntent } from '@/ai/queryEngine'
import { savingsRecommendation } from '@/ai/analysis/budget'
import { buildSheetProfile } from '@/ai/sheetProfile'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeInsights(): SheetInsights {
  return {
    headerRow: 0,
    headers: ['Name', 'Amount'],
    columnStats: [],
    totalIncome: 5000,
    totalExpenses: 3000,
    outliers: [],
  } as unknown as SheetInsights
}

function makeTarget(): AnalysisTarget {
  return {
    sheet: { cells: {}, id: 'sheet-1' } as unknown as AnalysisTarget['sheet'],
    workbook: { sheets: [], name: 'TestBook' } as unknown as AnalysisTarget['workbook'],
    workbookName: 'TestBook',
    getComputedValue: () => '',
    getSheetComputedValue: () => '',
    context: {
      insights: makeInsights(),
      sampleRows: [],
      sampleRowsTruncated: false,
    },
    isAttached: false,
  } as unknown as AnalysisTarget
}

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    message: 'test message',
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
    intent: {
      intentType: 'general',
      confidence: 0.5,
      routingSource: 'regex',
      parameters: {},
    } as unknown as PipelineContext['intent'],
    mode: 'act' as PipelineContext['mode'],
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DeterministicDispatcher stage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Reset default mock returns
    vi.mocked(isOutlierFollowUp).mockReturnValue(false)
    vi.mocked(isQueryIntent).mockReturnValue(false)
    vi.mocked(isBudgetExplainQuery).mockReturnValue(false)
  })

  it('has the correct stage name', () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    expect(stage.name).toBe('deterministic-dispatcher')
  })

  // ─── REQ-6.4: Uses intent/mode metadata ─────────────────────────────────

  it('returns null when context.intent is not set (REQ-6.4)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({ intent: undefined, mode: 'act' })

    const result = await stage.process(ctx)
    expect(result).toBeNull()
  })

  it('returns null when context.mode is not set (REQ-6.4)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({ mode: undefined })

    const result = await stage.process(ctx)
    expect(result).toBeNull()
  })

  // ─── REQ-6.3: Returns null when no skill handles the intent ──────────────

  it('returns null for general/unknown intent (REQ-6.3)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'hello there',
      intent: { intentType: 'general', confidence: 0.3, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'chat',
    })

    const result = await stage.process(ctx)
    expect(result).toBeNull()
  })

  // ─── REQ-6.2: Claims when intent maps to a built-in skill ────────────────

  it('claims for clean intent (REQ-6.2)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'clean my data',
      intent: { intentType: 'clean', confidence: 0.9, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('deterministic-dispatcher')
    expect(result!.metadata?.toolUsed).toBe('cleaning')
    expect(runCleaningSkill).toHaveBeenCalled()
  })

  it('claims for report intent (REQ-6.2)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'generate a report',
      intent: { intentType: 'report', confidence: 0.9, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('reporting')
    expect(generateReport).toHaveBeenCalled()
  })

  it('claims for compare intent (REQ-6.2)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'compare sheets',
      intent: { intentType: 'compare', confidence: 0.9, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('comparison')
    expect(queryComparison).toHaveBeenCalled()
  })

  it('claims for query intent (REQ-6.2)', async () => {
    vi.mocked(isQueryIntent).mockReturnValue(true)

    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'what is the total amount',
      intent: { intentType: 'filter', confidence: 0.8, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('query')
    expect(runQueryFromIntent).toHaveBeenCalled()
  })

  it('returns null when query intent produces no result (REQ-6.3)', async () => {
    vi.mocked(isQueryIntent).mockReturnValue(true)
    vi.mocked(runQueryFromIntent).mockReturnValue(null)

    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'some query',
      intent: { intentType: 'find', confidence: 0.7, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)
    expect(result).toBeNull()
  })

  it('claims for budget intent (REQ-6.2)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'analyze my budget',
      intent: { intentType: 'budget', confidence: 0.85, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('budget')
  })

  it('claims for advise mode with monthly income (REQ-6.2)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'how can I save money',
      intent: { intentType: 'general', confidence: 0.6, routingSource: 'regex', parameters: { monthlyIncome: 6000 } } as unknown as PipelineContext['intent'],
      mode: 'advise',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('budget')
    expect(savingsRecommendation).toHaveBeenCalledWith(6000, expect.anything())
  })

  it('claims for outlier follow-up (REQ-6.2)', async () => {
    vi.mocked(isOutlierFollowUp).mockReturnValue(true)

    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'why are those values unusual',
      intent: { intentType: 'general', confidence: 0.5, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'explain',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('outlier-explain')
  })

  it('claims for data awareness query (REQ-6.2)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'what do you know about my data',
      intent: { intentType: 'general', confidence: 0.5, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'chat',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('data-awareness')
    expect(result!.message).toContain('What I can see about your data')
  })

  it('claims for budget explain on budget sheet (REQ-6.2)', async () => {
    vi.mocked(isBudgetExplainQuery).mockReturnValue(true)
    vi.mocked(buildSheetProfile).mockReturnValue({
      name: 'Budget',
      rowCount: 20,
      colCount: 5,
      detectedPurpose: 'budget',
      columns: [],
    } as unknown as ReturnType<typeof buildSheetProfile>)

    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'explain my spending',
      intent: { intentType: 'general', confidence: 0.5, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'explain',
    })

    const result = await stage.process(ctx)

    expect(result).not.toBeNull()
    expect(result!.metadata?.toolUsed).toBe('budget')
  })

  // ─── REQ-6.1: Result shape matches StageResult contract ──────────────────

  it('produces well-formed StageResult with all required fields (REQ-6.1)', async () => {
    const stage = createDeterministicDispatcherStage(makeTarget(), 'TestBook')
    const ctx = makeContext({
      message: 'clean my data',
      intent: { intentType: 'clean', confidence: 0.9, routingSource: 'regex', parameters: {} } as unknown as PipelineContext['intent'],
      mode: 'act',
    })

    const result = await stage.process(ctx)

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('stageName', 'deterministic-dispatcher')
    expect(result).toHaveProperty('metadata')
  })
})
