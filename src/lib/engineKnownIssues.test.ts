import { describe, it, expect } from 'vitest'
import { detectKnownEngineIssues } from './engineKnownIssues'
import type { SheetData } from '@/types'

function sheet(cells: Record<string, { value?: string | number | boolean | null; formula?: string }>): SheetData {
  const normalized: SheetData['cells'] = {}
  for (const [id, cell] of Object.entries(cells)) {
    normalized[id] = { value: cell.value ?? null, formula: cell.formula }
  }
  return {
    id: 's1',
    name: 'Sheet1',
    cells: normalized,
    columnWidths: {},
    rowHeights: {},
  }
}

const rulesFor = (cells: Parameters<typeof sheet>[0]) =>
  detectKnownEngineIssues(sheet(cells)).map((issue) => issue.rule)

describe('detectKnownEngineIssues — date arithmetic (#312)', () => {
  it('flags direct DATE() arithmetic', () => {
    expect(rulesFor({ B1: { formula: '=DATE(2023,1,15)+30' } })).toEqual(['date-arithmetic'])
  })

  it('flags arithmetic on a cell that produces a date', () => {
    expect(
      rulesFor({ A1: { formula: '=DATE(2023,1,15)' }, B1: { formula: '=A1+30' } }),
    ).toEqual(['date-arithmetic'])
  })

  it('follows simple aliases to a date-producing cell', () => {
    expect(
      rulesFor({
        A1: { formula: '=DATE(2023,1,15)' },
        B1: { formula: '=A1' },
        C1: { formula: '=B1-1' },
      }),
    ).toEqual(['date-arithmetic'])
  })

  it('does not flag multiplication, which coerces to a number', () => {
    expect(rulesFor({ A1: { formula: '=DATE(2023,1,15)' }, B1: { formula: '=A1*2' } })).toEqual([])
  })

  it('does not flag arithmetic on a plain number or a date-formatted import', () => {
    expect(
      rulesFor({
        A1: { value: 45000 },
        B1: { formula: '=A1+30' },
        C1: { value: 45000, formula: '=C1' },
      }),
    ).toEqual([])
  })

  it('ignores operators inside string literals', () => {
    expect(rulesFor({ A1: { formula: '="date+30"' } })).toEqual([])
  })
})

describe('detectKnownEngineIssues — approximate lookups (#283)', () => {
  it('flags VLOOKUP/HLOOKUP with the 4th argument omitted or TRUE', () => {
    expect(rulesFor({ A1: { formula: '=VLOOKUP(1,B:C,2)' } })).toEqual(['approx-lookup'])
    expect(rulesFor({ A1: { formula: '=HLOOKUP(1,B1:C2,2,TRUE)' } })).toEqual(['approx-lookup'])
  })

  it('accepts exact-match VLOOKUP', () => {
    expect(rulesFor({ A1: { formula: '=VLOOKUP(1,B:C,2,FALSE)' } })).toEqual([])
    expect(rulesFor({ A1: { formula: '=VLOOKUP(1,B:C,2,0)' } })).toEqual([])
  })

  it('flags MATCH without an explicit exact-match type', () => {
    expect(rulesFor({ A1: { formula: '=MATCH(1,B:B)' } })).toEqual(['approx-lookup'])
    expect(rulesFor({ A1: { formula: '=MATCH(1,B:B,1)' } })).toEqual(['approx-lookup'])
  })

  it('accepts exact-match MATCH', () => {
    expect(rulesFor({ A1: { formula: '=MATCH(1,B:B,0)' } })).toEqual([])
  })

  it('handles nested calls and commas inside strings', () => {
    expect(
      rulesFor({ A1: { formula: '=VLOOKUP("a,b",INDIRECT("X1:Y9"),2)' } }),
    ).toEqual(['approx-lookup'])
  })
})

describe('detectKnownEngineIssues — wildcard escapes (#295)', () => {
  it('accepts Excel wildcards that the engine handles correctly', () => {
    expect(rulesFor({ A1: { formula: '=COUNTIF(A:A,"a*")' } })).toEqual([])
    expect(rulesFor({ A1: { formula: '=SUMIF(A:A,"a?c",B:B)' } })).toEqual([])
  })

  it('flags tilde escapes', () => {
    expect(rulesFor({ A1: { formula: '=COUNTIF(A:A,"a~*")' } })).toEqual(['wildcard-escape'])
  })

  it('flags SQL metacharacters that leak into criteria', () => {
    expect(rulesFor({ A1: { formula: '=COUNTIF(A:A,"a_c")' } })).toEqual(['wildcard-escape'])
    expect(rulesFor({ A1: { formula: '=COUNTIFS(A:A,"50%",B:B,1)' } })).toEqual([
      'wildcard-escape',
    ])
  })
})

describe('detectKnownEngineIssues — grouping and ordering', () => {
  it('groups cells by rule in first-seen order and keeps every cell', () => {
    const issues = detectKnownEngineIssues(
      sheet({
        A1: { formula: '=MATCH(1,B:B)' },
        A2: { formula: '=DATE(2023,1,1)+1' },
        A3: { formula: '=VLOOKUP(1,C:D,2)' },
      }),
    )
    expect(issues.map((i) => i.rule)).toEqual(['approx-lookup', 'date-arithmetic'])
    expect(issues[0].cells).toEqual(['A1', 'A3'])
    expect(issues[1].cells).toEqual(['A2'])
  })

  it('labels each issue with its upstream link', () => {
    const [issue] = detectKnownEngineIssues(sheet({ A1: { formula: '=MATCH(1,B:B)' } }))
    expect(issue.upstreamIssue).toBe('https://github.com/psu3d0/formualizer/issues/283')
  })

  it('ignores value-only cells', () => {
    expect(rulesFor({ A1: { value: 'VLOOKUP looking text' } })).toEqual([])
  })
})
