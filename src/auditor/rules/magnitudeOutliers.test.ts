import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

const RULE = 'magnitude-outliers'

describe('magnitude-outliers rule', () => {
  it('flags a value far outside its column', () => {
    const cells = { ...fill('A', 1, 14, (r) => 100 + r), A5: { value: 90000 } }
    expect(findingsOf(cells, RULE).map((f) => f.cells[0].cellId)).toEqual(['A5'])
  })

  it('needs at least ten numbers in the column', () => {
    const cells = { ...fill('A', 1, 8, (r) => 100 + r), A5: { value: 90000 } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('ignores a column of identical values and the last row (likely a total)', () => {
    expect(findingsOf(fill('A', 1, 12, () => 7), RULE)).toEqual([])
    const withTotal = { ...fill('A', 1, 12, (r) => 100 + r), A13: { value: 5000 } }
    expect(findingsOf(withTotal, RULE)).toEqual([])
  })
})
