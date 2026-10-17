import { describe, expect, it } from 'vitest'
import {
  parseNumberFormatPhrase,
  parseFilterPhrase,
  parseMultiSortPhrase,
  parseFormatAsTablePhrase,
  parseLayoutPhrase,
  parseProfessionalizePhrase,
  parseStyleRecipePhrase,
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

  it('parses bare "percent" phrasing with no explicit column (§4 Q4 catalog)', () => {
    expect(parseNumberFormatPhrase('show these as percentages')).toEqual({
      numberFormat: 'percent',
    })
    expect(parseNumberFormatPhrase('show as a percentage')).toEqual({
      numberFormat: 'percent',
    })
    expect(parseNumberFormatPhrase('format these as percent')).toEqual({
      numberFormat: 'percent',
    })
  })

  it('still extracts an explicit column for percent (bare branch does not steal it)', () => {
    expect(parseNumberFormatPhrase('format column B as percent')).toEqual({
      numberFormat: 'percent',
      range: 'B',
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

  it('routes layout phrases through the act path', () => {
    expect(resolveActTemplates('set column C width to 200').actions[0]).toMatchObject({
      tool: 'set_column_width',
      params: { column: 'C', width: 200 },
    })
    expect(resolveActTemplates('make row 1 taller').actions[0]).toMatchObject({
      tool: 'set_row_height',
      params: { row: '1', height: 44 },
    })
    expect(resolveActTemplates('auto-fit the rows').actions[0]?.tool).toBe('auto_fit')
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

describe('parseLayoutPhrase', () => {
  it('parses explicit column width', () => {
    expect(parseLayoutPhrase('set column C width to 200')).toEqual({ kind: 'width', column: 'C', width: 200 })
    expect(parseLayoutPhrase('set the width of column B to 150')).toEqual({ kind: 'width', column: 'B', width: 150 })
    expect(parseLayoutPhrase('set columns B:D to 120px')).toEqual({ kind: 'width', column: 'B:D', width: 120 })
  })

  it('parses relative width (wider / widen) with a default target', () => {
    expect(parseLayoutPhrase('make column B wider')).toEqual({ kind: 'width', column: 'B', width: 200 })
    expect(parseLayoutPhrase('widen columns B:D')).toEqual({ kind: 'width', column: 'B:D', width: 200 })
  })

  it('parses explicit and relative row height', () => {
    expect(parseLayoutPhrase('set row 2 height to 40')).toEqual({ kind: 'height', row: '2', height: 40 })
    expect(parseLayoutPhrase('set rows 2:5 height to 32')).toEqual({ kind: 'height', row: '2:5', height: 32 })
    expect(parseLayoutPhrase('make row 1 taller')).toEqual({ kind: 'height', row: '1', height: 44 })
  })

  it('parses auto-fit with and without a row spec', () => {
    expect(parseLayoutPhrase('auto-fit the rows')).toEqual({ kind: 'autofit' })
    expect(parseLayoutPhrase('resize rows to fit content')).toEqual({ kind: 'autofit' })
    expect(parseLayoutPhrase('auto fit rows 2:10')).toEqual({ kind: 'autofit', row: '2:10' })
  })

  it('ignores non-layout phrases', () => {
    expect(parseLayoutPhrase('bold the headers')).toBeNull()
    expect(parseLayoutPhrase('set this as the header')).toBeNull()
    expect(parseLayoutPhrase('delete row 5')).toBeNull()
    expect(parseLayoutPhrase('format column B as currency')).toBeNull()
  })
})

describe('parseStyleRecipePhrase', () => {
  it('routes header styling requests', () => {
    expect(parseStyleRecipePhrase('style the header row')).toEqual({ recipe: 'header' })
    expect(parseStyleRecipePhrase('make the header stand out')).toEqual({ recipe: 'header' })
    expect(parseStyleRecipePhrase('format the headers')).toEqual({ recipe: 'header' })
  })

  it('routes total-row requests', () => {
    expect(parseStyleRecipePhrase('add a total row')).toEqual({ recipe: 'total_row' })
    expect(parseStyleRecipePhrase('add totals at the bottom')).toEqual({ recipe: 'total_row' })
  })

  it('routes table-polish requests', () => {
    expect(parseStyleRecipePhrase('polish this table')).toEqual({ recipe: 'table_polish' })
    expect(parseStyleRecipePhrase('make this table look nice')).toEqual({ recipe: 'table_polish' })
  })

  it('does not steal plain "bold the headers" or "make it a table"', () => {
    expect(parseStyleRecipePhrase('bold the headers')).toBeNull()
    expect(parseStyleRecipePhrase('make it a table')).toBeNull()
    expect(parseStyleRecipePhrase('add a row')).toBeNull()
  })
})

describe('resolveActTemplates — style recipes', () => {
  it('routes recipe phrases through the act path', () => {
    expect(resolveActTemplates('style the header row').actions[0]).toMatchObject({
      tool: 'style_recipe',
      params: { recipe: 'header' },
    })
    expect(resolveActTemplates('add a total row').actions[0]).toMatchObject({
      tool: 'style_recipe',
      params: { recipe: 'total_row' },
    })
    expect(resolveActTemplates('polish this table').actions[0]?.tool).toBe('style_recipe')
  })
})

describe('parseProfessionalizePhrase', () => {
  it('matches general whole-sheet polish phrasings', () => {
    expect(parseProfessionalizePhrase('make this look professional')).toBe(true)
    expect(parseProfessionalizePhrase('make my sheet look professional')).toBe(true)
    expect(parseProfessionalizePhrase('professionalize this')).toBe(true)
    expect(parseProfessionalizePhrase('professionalise my sheet')).toBe(true)
    expect(parseProfessionalizePhrase('clean up the formatting')).toBe(true)
    expect(parseProfessionalizePhrase('format this like a pro')).toBe(true)
    expect(parseProfessionalizePhrase('format it professionally')).toBe(true)
  })

  it('does NOT steal the narrow recipe phrases', () => {
    // style_recipe-owned
    expect(parseProfessionalizePhrase('bold the headers')).toBe(false)
    expect(parseProfessionalizePhrase('style the header row')).toBe(false)
    expect(parseProfessionalizePhrase('add a total row')).toBe(false)
    expect(parseProfessionalizePhrase('polish this table')).toBe(false)
    // format_as_table-owned
    expect(parseProfessionalizePhrase('format this as a table')).toBe(false)
    expect(parseProfessionalizePhrase('make it a table')).toBe(false)
  })

  it('ignores unrelated requests', () => {
    expect(parseProfessionalizePhrase('sort by amount')).toBe(false)
    expect(parseProfessionalizePhrase('delete row 5')).toBe(false)
    expect(parseProfessionalizePhrase('what is a professional spreadsheet')).toBe(false)
  })

  it('rejects negated / non-command phrasings (finding #9)', () => {
    expect(parseProfessionalizePhrase("don't professionalize this")).toBe(false)
    expect(parseProfessionalizePhrase('do not professionalize my sheet')).toBe(false)
    expect(parseProfessionalizePhrase('no need to clean this up')).toBe(false)
    expect(parseProfessionalizePhrase('no need to make this look professional')).toBe(false)
    expect(parseProfessionalizePhrase('never professionalise my sheet')).toBe(false)
  })

  it('still matches genuine commands after the negation guard', () => {
    expect(parseProfessionalizePhrase('make this look professional')).toBe(true)
    expect(parseProfessionalizePhrase('professionalize my sheet')).toBe(true)
    expect(parseProfessionalizePhrase('clean up the formatting')).toBe(true)
    expect(parseProfessionalizePhrase('format this like a pro')).toBe(true)
  })
})

describe('resolveActTemplates — professionalize defers to the pipeline', () => {
  // The local fallback lacks a live sheet/profile, so the professionalize rule
  // claims the general phrase (keeping the narrow recipes from stealing it) but
  // returns no action — the pipeline's agent-parser builds the real plan.
  it('returns an empty (deferred) result for a general makeover phrase', () => {
    const result = resolveActTemplates('make this look professional')
    expect(result.actions).toEqual([])
    expect(result.message).toBe('')
  })

  it('still routes the narrow recipes (not stolen by professionalize)', () => {
    expect(resolveActTemplates('add a total row').actions[0]?.tool).toBe('style_recipe')
    expect(resolveActTemplates('format this as a table').actions[0]?.tool).toBe('format_as_table')
  })
})
