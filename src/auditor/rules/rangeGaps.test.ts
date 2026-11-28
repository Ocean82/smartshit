import { describe, expect, it } from 'vitest'
import { fill, findingsOf } from '../__tests__/helpers'

const RULE = 'range-gaps'
const data = (from: number, to: number) => fill('A', from, to, (r) => r)

describe('range-gaps rule', () => {
  it('flags a number just above the range and offers a range extension', () => {
    const [f] = findingsOf({ ...data(1, 5), C1: { value: null, formula: '=SUM(A2:A5)' } }, RULE)
    expect(f.cells.map((c) => c.cellId)).toEqual(['C1', 'A1'])
    expect(f.autoFixable).toBe(true)
    expect(f.fixActions).toEqual([{ cellId: 'C1', formula: '=SUM(A1:A5)' }])
  })

  it('flags a number just below and beside the range', () => {
    expect(findingsOf({ ...data(1, 4), C1: { value: null, formula: '=SUM(A1:A3)' } }, RULE)[0].fixActions?.[0].formula).toBe('=SUM(A1:A4)')
    const row = { A1: { value: 1 }, B1: { value: 2 }, C1: { value: 3 }, D1: { value: 4 }, A3: { value: null, formula: '=SUM(A1:C1)' } }
    expect(findingsOf(row, RULE)[0].fixActions?.[0].formula).toBe('=SUM(A1:D1)')
  })

  it('flags a neighbouring item formula but never offers an automatic fix', () => {
    const cells = { A1: { value: null, formula: '=B1*2' }, B1: { value: 3 }, ...fill('A', 2, 4, (r) => r), C1: { value: null, formula: '=SUM(A2:A4)' } }
    const [f] = findingsOf(cells, RULE, (id) => (id === 'A1' ? '6' : id === 'B1' ? '3' : ''))
    expect(f.cells.map((c) => c.cellId)).toContain('A1')
    expect(f.autoFixable).toBe(false)
    expect(f.fixActions).toBeUndefined()
  })

  it('does not flag a neighbouring total or a cell that depends on the formula', () => {
    // A5 is a total (aggregate), A6 reads C1: neither belongs in SUM(A1:A4).
    const cells = { ...data(1, 4), A5: { value: null, formula: '=SUM(A1:A4)' }, A6: { value: null, formula: '=C1*2' }, C1: { value: null, formula: '=SUM(A1:A4)' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('sees past a single empty row', () => {
    const cells = { ...data(1, 3), A5: { value: 50 }, C1: { value: null, formula: '=SUM(A1:A3)' } }
    const [f] = findingsOf(cells, RULE)
    expect(f.cells.map((c) => c.cellId)).toContain('A5')
    expect(f.autoFixable).toBe(false)
  })

  it('does not reach past a gap into data another aggregate already sums', () => {
    const cells = { ...data(1, 3), ...fill('A', 5, 7, (r) => r), C1: { value: null, formula: '=SUM(A1:A3)' }, C5: { value: null, formula: '=SUM(A5:A7)' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('checks every edge of a two-dimensional range', () => {
    const cells: Record<string, { value: number | null; formula?: string }> = {}
    for (let r = 1; r <= 4; r++) for (const c of 'ABC') cells[`${c}${r}`] = { value: r }
    cells.E1 = { value: null, formula: '=SUM(A2:C4)' }
    const [f] = findingsOf(cells, RULE)
    expect(f.cells.map((c) => c.cellId)).toEqual(['E1', 'A1', 'B1', 'C1'])
    expect(f.fixActions?.[0].formula).toBe('=SUM(A1:C4)')
  })

  it('ignores ranges that are not arguments of an aggregate function', () => {
    const cells = { ...data(1, 5), B1: { value: null, formula: '=VLOOKUP(2,A2:A5,1,FALSE)' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })

  it('does not mistake a text neighbour for data', () => {
    const cells = { A1: { value: 'Header' }, ...fill('A', 2, 5, (r) => r), C1: { value: null, formula: '=SUM(A2:A5)' } }
    expect(findingsOf(cells, RULE)).toEqual([])
  })
})
