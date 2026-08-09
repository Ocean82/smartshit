/**
 * Unit tests for TemplateResolver stage.
 *
 * Validates: REQ-2.3 (independently testable), REQ-10.2 (backward compat)
 *
 * Tests the claim/pass contract:
 * - Claims when resolveGalleryTemplate finds a match
 * - Passes (returns null) when no template matches
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PipelineContext } from '../types'

// Mock the templates module
vi.mock('@/templates', () => ({
  resolveGalleryTemplate: vi.fn(),
  executeTemplateTool: vi.fn(),
}))

import { resolveGalleryTemplate, executeTemplateTool } from '@/templates'
import { createTemplateResolverStage } from '../stages/templateResolver'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeContext(message = 'Create a monthly budget'): PipelineContext {
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

describe('TemplateResolver stage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('claims the input when a template match is found', async () => {
    const mockResolve = vi.mocked(resolveGalleryTemplate)
    mockResolve.mockReturnValue({
      name: 'monthly-budget',
      label: 'Monthly Budget',
      prompt: 'Create a monthly budget',
      tool: 'template_monthly_budget',
    })

    const mockExecute = vi.mocked(executeTemplateTool)
    mockExecute.mockReturnValue({ success: true, message: 'Budget template applied', modified: 12 })

    const deps = makeDeps()
    const stage = createTemplateResolverStage(deps)
    const result = await stage.process(makeContext())

    expect(result).not.toBeNull()
    expect(result!.stageName).toBe('template-resolver')
    expect(result!.success).toBe(true)
    expect(result!.message).toContain('Budget template applied')
  })

  it('passes (returns null) when no template matches', async () => {
    const mockResolve = vi.mocked(resolveGalleryTemplate)
    mockResolve.mockReturnValue(null)

    const deps = makeDeps()
    const stage = createTemplateResolverStage(deps)
    const result = await stage.process(makeContext('explain my expenses'))

    expect(result).toBeNull()
  })

  it('has the correct stage name', () => {
    const deps = makeDeps()
    const stage = createTemplateResolverStage(deps)
    expect(stage.name).toBe('template-resolver')
  })

  it('calls pushHistory and buildExecContext when claiming', async () => {
    const mockResolve = vi.mocked(resolveGalleryTemplate)
    mockResolve.mockReturnValue({
      name: 'sales-tracker',
      label: 'Sales Tracker',
      prompt: 'Build a sales tracker',
      tool: 'template_sales_tracker',
    })

    const mockExecute = vi.mocked(executeTemplateTool)
    mockExecute.mockReturnValue({ success: true, message: 'Sales tracker created', modified: 8 })

    const deps = makeDeps()
    const stage = createTemplateResolverStage(deps)
    await stage.process(makeContext('Build a sales tracker'))

    expect(deps.pushHistory).toHaveBeenCalledWith('Template: Sales Tracker')
    expect(deps.buildExecContext).toHaveBeenCalledWith({ suppressHistory: true })
  })

  it('includes metadata with template name and tool used', async () => {
    const mockResolve = vi.mocked(resolveGalleryTemplate)
    mockResolve.mockReturnValue({
      name: 'monthly-budget',
      label: 'Monthly Budget',
      prompt: 'Create a monthly budget',
      tool: 'template_monthly_budget',
    })

    const mockExecute = vi.mocked(executeTemplateTool)
    mockExecute.mockReturnValue({ success: true, message: 'Done', modified: 5 })

    const deps = makeDeps()
    const stage = createTemplateResolverStage(deps)
    const result = await stage.process(makeContext())

    expect(result!.metadata).toEqual(
      expect.objectContaining({
        toolUsed: 'template_monthly_budget',
        templateName: 'monthly-budget',
      }),
    )
  })
})
