import { describe, expect, it } from 'vitest'
import { extractCellContainsValue } from './formatContains'
import { resolveActTemplates } from './actTemplates'

describe('extractCellContainsValue', () => {
  it('captures the value after contain / containing / with', () => {
    expect(extractCellContainsValue('highlight cells containing 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells that contain 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells with 4')).toBe('4')
  })

  it('strips articles and descriptor nouns before the value', () => {
    expect(extractCellContainsValue('highlight all cells that contain a 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells containing an X')).toBe('x')
    expect(extractCellContainsValue('identify cells that contain the number 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells with the value 4')).toBe('4')
  })

  it('returns null when the phrase is not a cells-contains pattern', () => {
    expect(extractCellContainsValue('highlight negatives')).toBeNull()
  })

  it('defers "contains numbers" type phrases (returns null) so routing falls through', () => {
    expect(extractCellContainsValue('change all cells with numbers to red')).toBeNull()
    expect(extractCellContainsValue('highlight cells that contain numbers red')).toBeNull()
    expect(extractCellContainsValue('color cells with numbers red')).toBeNull()
    expect(extractCellContainsValue('highlight cells that contain numbers')).toBeNull()
  })

  it('rejects a captured stop/color word (singular number then color)', () => {
    expect(extractCellContainsValue('color cells with a number red')).toBeNull()
  })

  it('keeps an explicitly quoted stop/color word as a literal search value', () => {
    // Quotes signal a deliberate literal (e.g. a status column of "red"/"green"),
    // so the stop-word guard is skipped — unlike the unquoted color-cue case above.
    expect(extractCellContainsValue('highlight cells containing "red"')).toBe('red')
    expect(extractCellContainsValue("highlight cells containing 'green'")).toBe('green')
    expect(extractCellContainsValue('highlight cells that contain "numbers"')).toBe('numbers')
  })

  it('still returns real literals after the numbers fix (regression)', () => {
    expect(extractCellContainsValue('identify cells that contain the number 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells containing 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells with the value 4')).toBe('4')
    expect(extractCellContainsValue('highlight cells containing an X')).toBe('x')
  })
})

describe('resolveActTemplates — numeric highlight', () => {
  it('routes "change all cells with numbers to red" to is_number (not contains)', () => {
    const result = resolveActTemplates('change all cells with numbers to red')
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.tool).toBe('format_cells')
    expect(result.actions[0]?.params).toMatchObject({
      condition: { operator: 'is_number' },
      bgColor: '#FEE2E2',
    })
  })

  it('routes "highlight cells that contain numbers red" to is_number', () => {
    const result = resolveActTemplates('highlight cells that contain numbers red')
    expect(result.actions[0]?.params).toMatchObject({
      condition: { operator: 'is_number' },
      bgColor: '#FEE2E2',
    })
  })

  it('keeps "containing 4" as a contains literal (regression)', () => {
    const result = resolveActTemplates('highlight cells containing 4')
    expect(result.actions[0]?.params).toMatchObject({
      condition: { operator: 'contains', value: '4' },
    })
  })

  it('keeps "highlight negative numbers" as negative (not is_number)', () => {
    const result = resolveActTemplates('highlight negative numbers')
    expect(result.actions[0]?.params).toMatchObject({
      condition: { operator: 'negative' },
    })
  })
})

describe('resolveActTemplates — contains highlight', () => {
  it('does not capture the article "a" as the contains value', () => {
    const result = resolveActTemplates('highlight all cells that contain a 4')
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.tool).toBe('format_cells')
    expect(result.actions[0]?.params).toMatchObject({
      condition: { operator: 'contains', value: '4' },
    })
  })

  it('still handles "containing 4" without an article', () => {
    const result = resolveActTemplates('highlight cells containing 4')
    expect(result.actions[0]?.params).toMatchObject({
      condition: { operator: 'contains', value: '4' },
    })
  })
})
