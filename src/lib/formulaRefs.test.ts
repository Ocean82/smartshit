import { describe, expect, it } from 'vitest'
import { collectSheetFormulaRefs, extractFormulaRefs, findDependents, listPrecedents } from './formulaRefs'

const short = (f: string) =>
  extractFormulaRefs(f).map((r) => `${r.sheet ?? ''}!${r.startRow},${r.startCol}:${r.endRow},${r.endCol}`)

describe('extractFormulaRefs', () => {
  it('reads plain, absolute, and mixed references', () => {
    expect(short('=A1+$B$2*C$3+$D4')).toEqual(['!0,0:0,0', '!1,1:1,1', '!2,2:2,2', '!3,3:3,3'])
  })

  it('reads ranges as one normalized ref', () => {
    expect(short('=SUM(B10:A1)')).toEqual(['!0,0:9,1'])
  })

  it('keeps sheet prefixes, quoted or bare', () => {
    expect(short("=Data!A1+'My Sheet'!B2:B3+'Bob''s'!C1")).toEqual([
      'Data!0,0:0,0',
      'My Sheet!1,1:2,1',
      "Bob's!0,2:0,2",
    ])
  })

  it('reads whole-column and whole-row ranges', () => {
    expect(short('=SUM(B:$C)+SUM(Data!2:4)')).toEqual(['!0,1:1048575,2', 'Data!1,0:3,16383'])
  })

  it('ignores function names, identifiers, and string literals', () => {
    expect(short('=LOG10(A1)+Rate2024+"B2"&ATAN2(1,2)')).toEqual(['!0,0:0,0'])
  })
})

describe('findDependents', () => {
  const refs = collectSheetFormulaRefs({
    A1: { value: 5 } as { formula?: string },
    B1: { formula: '=A10*2' },
    B2: { formula: '=SUM($A$1:A5)' },
    B3: { formula: "='Sheet 1'!A1" },
    B4: { formula: '=Other!A1' },
    B5: { formula: '=SUM(A:A)' },
  })

  it('matches exact cells and range interiors, not prefixes or other sheets', () => {
    expect(findDependents(refs, 'Sheet 1', 0, 0)).toEqual(['B2', 'B3', 'B5'])
    expect(findDependents(refs, 'Sheet 1', 9, 0)).toEqual(['B1', 'B5'])
  })
})

describe('listPrecedents', () => {
  it('expands same-sheet ranges up to the limit', () => {
    expect(listPrecedents('=A1+Other!B1+SUM(C1:C3)', 'S', 20)).toEqual(['A1', 'C1', 'C2', 'C3'])
    expect(listPrecedents('=SUM(A:A)', 'S', 3)).toEqual(['A1', 'A2', 'A3'])
  })
})
