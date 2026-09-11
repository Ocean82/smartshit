import { describe, expect, it } from 'vitest'
import { collectColumnUniqueValues } from './columnFilterValues'

describe('collectColumnUniqueValues', () => {
  const cells: Record<string, string> = {
    '1,0': 'Apple',
    '2,0': 'Banana',
    '3,0': 'apple',
    '4,0': '',
    '5,0': 'Banana',
  }
  const getDisplay = (row: number, col: number) => cells[`${row},${col}`] ?? ''

  it('returns unique values with blank first; case-insensitive dedupe', () => {
    expect(collectColumnUniqueValues({
      startRow: 1,
      endRow: 5,
      column: 0,
      getDisplay,
    })).toEqual(['', 'Apple', 'Banana'])
  })

  it('respects maxValues cap', () => {
    expect(collectColumnUniqueValues({
      startRow: 1,
      endRow: 5,
      column: 0,
      getDisplay,
      maxValues: 2,
    })).toHaveLength(2)
  })
})
