import { describe, expect, it } from 'vitest'
import {
  parseNumberFormatPhrase,
  parseFilterPhrase,
  parseMultiSortPhrase,
  parseFormatAsTablePhrase,
  isMultiSortPhrase,
} from './spreadsheetPhrases'
import { extractCellContainsValue } from './formatContains'
import { resolveActTemplates } from './actTemplates'

describe('parseNumberFormatPhrase', () => {
  it('parses format column as currency/percent/date', () => {
    expect(parseNumberFormatPhrase('format column B as currency')).toEqual({
      numberFormat: 'currency',
      range: 'B',
    })
    expect(parseNumberFormatPhrase('format Amount as percent')).toEqual({
      numberFormat: 'percent',
      range: 'Amount',
    })
    expect(parseNumberFormatPhrase('show column C as date')).toEqual({
      numberFormat: 'date',
      range: 'C',
    })
  })

  it('parses apply currency formatting', () => {
    expect(parseNumberFormatPhrase('apply currency formatting to column C')).toEqual({
      numberFormat: 'currency',
      range: 'C',
    })
    expect(parseNumberFormatPhrase('format as currency')).toEqual({
      numberFormat: 'currency',
    })
  })
})

describe('parseFilterPhrase', () => {
  it('parses where / by / comparison filters', () => {
    expect(parseFilterPhrase('filter where Status is Paid')).toEqual({
      column: 'Status',
      condition: 'equals',
      value: 'Paid',
    })
    expect(parseFilterPhrase('filter Amount > 100')).toEqual({
      column: 'Amount',
      condition: 'gt',
      value: '100',
    })
    expect(parseFilterPhrase('show only rows where Status equals Paid')).toEqual({
      column: 'Status',
      condition: 'equals',
      value: 'Paid',
    })
  })

  it('rejects vague filter requests', () => {
    expect(parseFilterPhrase('filter it')).toBeNull()
    expect(parseFilterPhrase('filter the data')).toBeNull()
  })
})

describe('parseMultiSortPhrase', () => {
  it('parses then / and then sorts', () => {
    expect(parseMultiSortPhrase('sort by Category then Amount')).toEqual({
      rules: [
        { column: 'Category', direction: 'asc' },
        { column: 'Amount', direction: 'asc' },
      ],
    })
    expect(parseMultiSortPhrase('sort by A and then by B descending')).toEqual({
      rules: [
        { column: 'A', direction: 'asc' },
        { column: 'B', direction: 'desc' },
      ],
    })
    expect(isMultiSortPhrase('sort by Category then Amount')).toBe(true)
    expect(isMultiSortPhrase('sort by Category')).toBe(false)
  })
})

describe('parseFormatAsTablePhrase', () => {
  it('parses table formatting requests', () => {
    expect(parseFormatAsTablePhrase('format this as a table')).toEqual({ theme: 'blue' })
    expect(parseFormatAsTablePhrase('make it look like a proper table with green theme')).toEqual({
      theme: 'green',
    })
    expect(parseFormatAsTablePhrase('what is a pivot table')).toBeNull()
  })
})

describe('extractCellContainsValue — have/has', () => {
  it('captures values after have/has', () => {
    expect(extractCellContainsValue('highlight cells that have a 4')).toBe('4')
    expect(extractCellContainsValue('color all cells that have a 4')).toBe('4')
  })
})

describe('resolveActTemplates — new phrase coverage', () => {
  it('formats column as currency', () => {
    const result = resolveActTemplates('format column B as currency')
    expect(result.actions[0]).toMatchObject({
      tool: 'format_cells',
      params: { range: 'B', numberFormat: 'currency' },
    })
  })

  it('filters by predicate', () => {
    const result = resolveActTemplates('filter where Status is Paid')
    expect(result.actions[0]).toMatchObject({
      tool: 'filter',
      params: { column: 'Status', condition: 'equals', value: 'Paid' },
    })
  })

  it('formats as table', () => {
    const result = resolveActTemplates('format this as a table')
    expect(result.actions[0]?.tool).toBe('format_as_table')
  })

  it('multi-sorts by two columns', () => {
    const result = resolveActTemplates('sort by Category then Amount')
    expect(result.actions[0]).toMatchObject({
      tool: 'multi_sort',
      params: {
        rules: [
          { column: 'Category', direction: 'asc' },
          { column: 'Amount', direction: 'asc' },
        ],
      },
    })
  })
})
