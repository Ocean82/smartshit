import { describe, expect, it } from 'vitest'
import { rowPassesFilters, buildFilteredRowIndex } from './rowFilter'

describe('rowPassesFilters', () => {
  const get = (row: number, col: number) => {
    const grid: Record<string, string> = {
      '0-0': 'Category',
      '1-0': 'Food',
      '2-0': 'Rent',
      '3-0': 'Travel',
    }
    return grid[`${row}-${col}`] ?? ''
  }

  it('keeps header row', () => {
    expect(rowPassesFilters(0, [{ column: 0, condition: 'equals', value: 'Food' }], get, 0)).toBe(true)
  })

  it('filters equals', () => {
    expect(rowPassesFilters(1, [{ column: 0, condition: 'equals', value: 'Food' }], get, 0)).toBe(true)
    expect(rowPassesFilters(2, [{ column: 0, condition: 'equals', value: 'Food' }], get, 0)).toBe(false)
  })

  it('filters contains', () => {
    expect(rowPassesFilters(3, [{ column: 0, condition: 'contains', value: 'rav' }], get, 0)).toBe(true)
  })
})

describe('buildFilteredRowIndex', () => {
  it('returns null when no filters', () => {
    expect(buildFilteredRowIndex(10, [], () => '')).toBeNull()
  })

  it('returns matching rows including header', () => {
    const get = (row: number) => ['H', 'a', 'b', 'a'][row] ?? ''
    const rows = buildFilteredRowIndex(4, [{ column: 0, condition: 'equals', value: 'a' }], (r) => get(r), 0)
    expect(rows).toEqual([0, 1, 3])
  })
})
