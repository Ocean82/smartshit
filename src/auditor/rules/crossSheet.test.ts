import { describe, expect, it } from 'vitest'
import { runAudit } from '../index'
import type { TestCells } from '../__tests__/helpers'
import { sheetOf } from '../__tests__/helpers'

/** Audit `a` as the open sheet of a workbook that also holds `others`. */
function auditInWorkbook(a: TestCells, others: Record<string, TestCells>, withWorkbook = true) {
  const sheet = sheetOf(a, 'a', 'Alpha')
  const sheets = [sheet, ...Object.entries(others).map(([name, cells]) => sheetOf(cells, name.toLowerCase(), name))]
  return runAudit(sheet, () => '1', [], {}, withWorkbook ? { workbook: { sheets } } : undefined)
}

const ids = (r: ReturnType<typeof runAudit>, rule: string) => r.findings.filter((f) => f.ruleId === rule)

describe('missing-sheet-reference rule', () => {
  it('flags a reference to a sheet that is not in the workbook', () => {
    const r = auditInWorkbook({ A1: { value: null, formula: '=Ghost!B2+1' } }, { Beta: {} })
    const [f] = ids(r, 'missing-sheet-reference')
    expect(f.severity).toBe('critical')
    expect(f.message).toContain('Ghost')
    expect(f.cells.map((c) => c.cellId)).toEqual(['A1'])
  })

  it('accepts existing sheets, quoted names and case differences', () => {
    const r = auditInWorkbook(
      { A1: { value: null, formula: "=beta!B2+'My Data'!C3" } },
      { Beta: { B2: { value: 1 } }, 'My Data': { C3: { value: 1 } } },
    )
    expect(ids(r, 'missing-sheet-reference')).toEqual([])
  })

  it('stays silent without workbook context and for text inside quotes', () => {
    expect(ids(auditInWorkbook({ A1: { value: null, formula: '=Ghost!B2' } }, {}, false), 'missing-sheet-reference')).toEqual([])
    expect(ids(auditInWorkbook({ A1: { value: null, formula: '="see Ghost!B2"' } }, {}), 'missing-sheet-reference')).toEqual([])
  })
})

describe('circular-refs across sheets', () => {
  it('detects a cycle that passes through another sheet', () => {
    const r = auditInWorkbook(
      { A1: { value: null, formula: '=Beta!A1+1' } },
      { Beta: { A1: { value: null, formula: '=Alpha!A1*2' } } },
    )
    const [f] = ids(r, 'circular-refs')
    expect(f.cells.map((c) => c.cellId)).toEqual(['A1'])
    expect(f.title).toContain('Beta!A1')
  })

  it('ignores a cycle that does not touch the open sheet', () => {
    const r = auditInWorkbook(
      { A1: { value: 1 } },
      { Beta: { A1: { value: null, formula: '=Gamma!A1' } }, Gamma: { A1: { value: null, formula: '=Beta!A1' } } },
    )
    expect(ids(r, 'circular-refs')).toEqual([])
  })

  it('still finds a same-sheet cycle without workbook context', () => {
    const r = auditInWorkbook({ A1: { value: null, formula: '=B1' }, B1: { value: null, formula: '=A1' } }, {}, false)
    expect(ids(r, 'circular-refs')).toHaveLength(1)
  })

  it('does not treat a non-circular chain across sheets as a cycle', () => {
    const r = auditInWorkbook(
      { A1: { value: null, formula: '=Beta!A1+1' } },
      { Beta: { A1: { value: null, formula: '=Gamma!A1' } }, Gamma: { A1: { value: 3 } } },
    )
    expect(ids(r, 'circular-refs')).toEqual([])
  })
})
