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
