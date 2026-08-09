/**
 * Unit tests for IntentClassifier stage.
 *
 * Validates: REQ-2.3 (independently testable), REQ-5.4, REQ-5.5
 *
 * Tests the enrichment/pass contract:
 * - Always returns null (never claims)
 * - Enriches context with intent and mode
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

// Mock the shared modules
vi.mock('@shared/intentParser', () => ({
  parseUserIntent: vi.fn(),
}))

vi.mock('@shared/mode', () => ({
  classifyMode: vi.fn(),
}))

import { parseUserIntent } from '@shared/intentParser'
import { classifyMode } from '@shared/mode'
import { createIntentClassifierStage } from '../stages/intentClassifier'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(message = 'analyze my expenses'): PipelineContext {
  return {
    message,
    workbook: { sheets: [], name: 'test' } as unknown as PipelineContext['workbook'],
    sheet: { cells: {} } as unknown as PipelineContext['sheet'],
    selection: null,
    getComputedValue: () => '',
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('IntentClassifier stage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('always returns null (never claims the input)', async () => {
    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'analyze',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'analyze my expenses',
      confidence: 0.85,
      routingSource: 'regex',
    } as ReturnType<typeof parseUserIntent>)
    vi.mocked(classifyMode).mockReturnValue('act')

    const stage = createIntentClassifierStage()
    const result = await stage.process(makeContext())

    expect(result).toBeNull()
  })

  it('enriches context with parsed intent', async () => {
    const mockIntent = {
      intentType: 'report',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'generate a report',
      confidence: 0.9,
      routingSource: 'regex',
    } as ReturnType<typeof parseUserIntent>

    vi.mocked(parseUserIntent).mockReturnValue(mockIntent)
    vi.mocked(classifyMode).mockReturnValue('act')

    const ctx = makeContext('generate a report')
    const stage = createIntentClassifierStage()
    await stage.process(ctx)

    expect(ctx.intent).toBe(mockIntent)
  })

  it('enriches context with classified mode', async () => {
    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'chat',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'explain my data',
      confidence: 0.5,
      routingSource: 'regex',
    } as ReturnType<typeof parseUserIntent>)
    vi.mocked(classifyMode).mockReturnValue('explain')

    const ctx = makeContext('explain my data')
    const stage = createIntentClassifierStage()
    await stage.process(ctx)

    expect(ctx.mode).toBe('explain')
  })

  it('has the correct stage name', () => {
    const stage = createIntentClassifierStage()
    expect(stage.name).toBe('intent-classifier')
  })

  it('returns null even for empty messages', async () => {
    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'unknown',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: '',
      confidence: 0,
      routingSource: 'regex',
    } as ReturnType<typeof parseUserIntent>)
    vi.mocked(classifyMode).mockReturnValue('chat')

    const stage = createIntentClassifierStage()
    const result = await stage.process(makeContext(''))

    expect(result).toBeNull()
  })

  it('calls parseUserIntent with the message from context', async () => {
    vi.mocked(parseUserIntent).mockReturnValue({
      intentType: 'clean',
      targetColumns: [],
      filters: {},
      parameters: {},
      rawQuery: 'clean my data',
      confidence: 0.8,
      routingSource: 'regex',
    } as ReturnType<typeof parseUserIntent>)
    vi.mocked(classifyMode).mockReturnValue('act')

    const stage = createIntentClassifierStage()
    await stage.process(makeContext('clean my data'))

    expect(parseUserIntent).toHaveBeenCalledWith('clean my data')
    expect(classifyMode).toHaveBeenCalledWith('clean my data')
  })
})
