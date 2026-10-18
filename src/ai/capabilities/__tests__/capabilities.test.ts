import { describe, expect, it, beforeEach } from 'vitest'
import { CAPABILITIES, capabilityPhrasesHash, getCapability } from '@shared/capabilities.js'
import {
  setCapabilityEmbeddingsForTests,
  resetCapabilityEmbeddingsForTests,
  scoreCapabilities,
  EMBEDDING_DIM,
} from '@/ai/nlp/capabilityEmbeddings'
import { resolveCapabilityParams } from '@/ai/capabilities/resolveParams'
import type { PipelineContext } from '@/ai/pipeline/types'
import type { SheetData } from '@/types'
import type { ColumnProfile } from '@/ai/types'

function unitVec(seed: number): Float32Array {
  const v = new Float32Array(EMBEDDING_DIM)
  v[seed % EMBEDDING_DIM] = 1
  return v
}

function nearVec(seed: number, noise = 0.05): Float32Array {
  const v = unitVec(seed)
  v[(seed + 1) % EMBEDDING_DIM] = noise
  // re-normalize lightly
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n)
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

describe('capabilities catalog', () => {
  it('includes the phase-1 soft capabilities', () => {
    const ids = CAPABILITIES.map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([
      'bold_headers',
      'sort_column',
      'filter_rows',
      'format_currency',
      'format_as_table',
      'highlight_contains',
      'highlight_numbers',
      'highlight_negatives',
      'totals_by_category',
    ]))
  })

  it('hashes examples deterministically', () => {
    expect(capabilityPhrasesHash()).toBe(capabilityPhrasesHash())
    expect(getCapability('sort_column')?.tool).toBe('sort_sheet')
  })

  it('exposes the §4 styling-catalog entries with the correct kind/tool', () => {
    // Compound style_recipe-backed outcomes are kind:'recipe' (router-inert,
    // resolved via Tier-1). They document the style_recipe target for consumers.
    expect(getCapability('style_header')?.kind).toBe('recipe')
    expect(getCapability('style_header')?.tool).toBe('style_recipe')
    expect(getCapability('add_totals_row')?.kind).toBe('recipe')
    expect(getCapability('add_totals_row')?.tool).toBe('style_recipe')
    expect(getCapability('table_polish')?.kind).toBe('recipe')
    expect(getCapability('table_polish')?.tool).toBe('style_recipe')

    // Single-tool, value-safe percent formatting is kind:'tool' so the router
    // can resolve its paraphrases to format_cells.
    expect(getCapability('format_percent')?.kind).toBe('tool')
    expect(getCapability('format_percent')?.tool).toBe('format_cells')

    // fit_columns is now a REAL resolvable entry: kind:'tool' → auto_fit with a
    // static target:'columns', backed by the column auto-fit mechanism.
    // Value-safe (changes only columnWidths), so the router can resolve it.
    expect(getCapability('fit_columns')?.kind).toBe('tool')
    expect(getCapability('fit_columns')?.tool).toBe('auto_fit')
    expect(getCapability('fit_columns')?.staticParams).toMatchObject({ target: 'columns' })
  })
})

describe('scoreCapabilities', () => {
  beforeEach(() => {
    resetCapabilityEmbeddingsForTests()
  })

  it('picks the nearest capability embedding', () => {
    setCapabilityEmbeddingsForTests([
      { capabilityId: 'sort_column', embedding: unitVec(0), phrases: [] },
      { capabilityId: 'format_as_table', embedding: unitVec(10), phrases: [] },
      { capabilityId: 'bold_headers', embedding: unitVec(20), phrases: [] },
    ])

    const { best, secondScore, topCapabilities } = scoreCapabilities(nearVec(0))
    expect(best?.capabilityId).toBe('sort_column')
    expect(best!.score).toBeGreaterThan(0.9)
    expect(best!.score).toBeGreaterThan(secondScore)
    expect(topCapabilities[0]?.capabilityId).toBe('sort_column')
    expect(topCapabilities.length).toBeGreaterThanOrEqual(2)
  })

  it('returns null best when not bootstrapped', () => {
    expect(scoreCapabilities(unitVec(0)).best).toBeNull()
  })
})

describe('resolveCapabilityParams', () => {
  const sheet = { id: 's1', name: 'Sheet1', cells: { A1: { value: 'Cat' }, B1: { value: 'Amount' } } } as unknown as SheetData
  const ctx = {
    message: '',
    sheet,
    workbook: { sheets: [sheet] },
    selection: null,
    getComputedValue: (r: number, c: number) => (r === 0 ? (c === 0 ? 'Cat' : 'Amount') : ''),
  } as unknown as PipelineContext

  const columns: ColumnProfile[] = [
    {
      name: 'Category',
      column: 'A',
      dtype: 'text',
      role: 'category',
      nonNullCount: 3,
      nullCount: 0,
      uniqueCount: 3,
      sampleValues: ['Food'],
    },
    {
      name: 'Amount',
      column: 'B',
      dtype: 'number',
      role: 'amount',
      nonNullCount: 3,
      nullCount: 0,
      uniqueCount: 3,
      sampleValues: [10],
    },
  ]

  it('resolves sort_column to amount desc', () => {
    const cap = getCapability('sort_column')!
    const result = resolveCapabilityParams(cap, 'put the largest expenses first', ctx, columns)
    expect(result).toMatchObject({
      tool: 'sort_sheet',
      params: { column: 'B', direction: 'desc' },
    })
  })

  it('resolves sort_column ascending from lowest-first phrasing', () => {
    const cap = getCapability('sort_column')!
    const result = resolveCapabilityParams(cap, 'put the smallest amounts first', ctx, columns)
    expect(result).toMatchObject({
      tool: 'sort_sheet',
      params: { column: 'B', direction: 'asc' },
    })
  })

  it('resolves format_as_table with blue theme', () => {
    const cap = getCapability('format_as_table')!
    const result = resolveCapabilityParams(cap, 'format this as a table', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_as_table',
      params: { theme: 'blue' },
    })
  })

  it('resolves format_percent to format_cells numberFormat percent', () => {
    const cap = getCapability('format_percent')!
    const result = resolveCapabilityParams(cap, 'show these as percentages', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_cells',
      params: { numberFormat: 'percent' },
    })
  })

  it('resolves highlight_contains from have/has phrasing', () => {
    const cap = getCapability('highlight_contains')!
    const result = resolveCapabilityParams(cap, 'highlight cells that have a 4', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_cells',
      params: { condition: { operator: 'contains', value: '4' } },
    })
  })

  it('resolves highlight_contains "containing 4" to the literal (regression)', () => {
    const cap = getCapability('highlight_contains')!
    const result = resolveCapabilityParams(cap, 'highlight cells containing 4', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_cells',
      params: { condition: { operator: 'contains', value: '4' } },
    })
  })

  it('highlight_contains defers "contain numbers red" to a clarification, not a bogus literal', () => {
    const cap = getCapability('highlight_contains')!
    expect(resolveCapabilityParams(cap, 'highlight cells that contain numbers red', ctx, columns))
      .toHaveProperty('clarification')
    expect(resolveCapabilityParams(cap, 'change all cells with numbers to red', ctx, columns))
      .toHaveProperty('clarification')
  })

  it('resolves highlight_numbers to is_number + red default fill', () => {
    const cap = getCapability('highlight_numbers')!
    const result = resolveCapabilityParams(cap, 'highlight numeric values', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_cells',
      params: { condition: { operator: 'is_number' }, bgColor: '#FEE2E2' },
    })
  })

  it('resolves highlight_numbers "change all cells with numbers to red" to is_number red', () => {
    const cap = getCapability('highlight_numbers')!
    const result = resolveCapabilityParams(cap, 'change all cells with numbers to red', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_cells',
      params: { condition: { operator: 'is_number' }, bgColor: '#FEE2E2' },
    })
  })

  it('resolves highlight_numbers with an explicit non-default color', () => {
    const cap = getCapability('highlight_numbers')!
    const result = resolveCapabilityParams(cap, 'make numeric cells blue', ctx, columns)
    expect(result).toMatchObject({
      tool: 'format_cells',
      params: { condition: { operator: 'is_number' }, bgColor: '#DBEAFE' },
    })
  })

  it('clarifies sort when no amount column exists', () => {
    const cap = getCapability('sort_column')!
    const result = resolveCapabilityParams(cap, 'put biggest first', ctx, [])
    expect(result).toHaveProperty('clarification')
  })
})
