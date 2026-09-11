import { describe, expect, it } from 'vitest'
import { buildTransposePasteWrites } from './transposePaste'

describe('buildTransposePasteWrites', () => {
  it('swaps rows and columns from the dest anchor', () => {
    const { writes } = buildTransposePasteWrites({
      cells: {
        A1: { value: 'a' },
        B1: { value: 'b' },
        A2: { value: 1 },
        B2: { value: 2 },
      },
      source: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
      destRow: 0,
      destCol: 3,
    })
    const byId = Object.fromEntries(writes.map((w) => [w.cellId, w.value]))
    expect(byId).toEqual({ D1: 'a', E1: 1, D2: 'b', E2: 2 })
  })

  it('shifts formula refs by the cell move delta', () => {
    const { writes } = buildTransposePasteWrites({
      cells: { A1: { value: null, formula: '=B1' } },
      source: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      destRow: 2,
      destCol: 2,
    })
    expect(writes[0]).toMatchObject({ cellId: 'C3', formula: '=D3' })
  })
})
