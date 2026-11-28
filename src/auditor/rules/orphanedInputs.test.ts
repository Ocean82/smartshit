import { describe, expect, it } from 'vitest'
import { runAudit } from '../index'
import type { TestCells } from '../__tests__/helpers'
import { fill, sheetOf } from '../__tests__/helpers'

const RULE = 'orphaned-inputs'

/** A small model: three formulas reading column A. */
const model = (extra: TestCells = {}): TestCells => ({
  ...fill('A', 1, 3, (r) => r),
  ...fill('C', 1, 3, (r) => `=A${r}*2`),
  ...extra,
})

function run(cells: TestCells, others: Record<string, TestCells> = {}, withWorkbook = true) {
  const sheet = sheetOf(cells, 'a', 'Alpha')
  const sheets = [sheet, ...Object.entries(others).map(([name, c]) => sheetOf(c, name.toLowerCase(), name))]
  const result = runAudit(sheet, () => '1', [], {}, withWorkbook ? { workbook: { sheets } } : undefined)
  return result.findings.filter((f) => f.ruleId === RULE)
}

describe('orphaned-inputs rule', () => {
  it('flags a labelled input that no formula reads', () => {
    const [f] = run(model({ E1: { value: 'Tax rate' }, F1: { value: 0.08 } }))
    expect(f.cells.map((c) => c.cellId)).toEqual(['F1'])
    expect(f.severity).toBe('info')
  })

  it('accepts an input read directly, through a range, or from another sheet', () => {
    expect(run(model({ E1: { value: 'Rate' }, F1: { value: 0.08 }, C4: { value: null, formula: '=F1+1' } }))).toEqual([])
    expect(run(model({ E1: { value: 'Rate' }, F1: { value: 0.08 }, C4: { value: null, formula: '=SUM(F1:F3)' } }))).toEqual([])
    expect(run(model({ E1: { value: 'Rate' }, F1: { value: 0.08 } }), { Beta: { A1: { value: null, formula: '=Alpha!F1' } } })).toEqual([])
  })

  it('does not call numbers inside a data table inputs', () => {
    expect(run(model({ A4: { value: 4 } }))).toEqual([])
  })

  it('needs a model (three or more formulas) and workbook context', () => {
    expect(run({ E1: { value: 'Rate' }, F1: { value: 0.08 }, C1: { value: null, formula: '=1+1' } })).toEqual([])
    expect(run(model({ E1: { value: 'Rate' }, F1: { value: 0.08 } }), {}, false)).toEqual([])
  })

  it('summarises many orphans in one finding', () => {
    const extra: TestCells = {}
    for (let r = 0; r < 8; r++) {
      extra[`H${r * 3 + 1}`] = { value: `Input ${r}` }
      extra[`I${r * 3 + 1}`] = { value: r + 0.5 }
    }
    const found = run(model(extra))
    expect(found).toHaveLength(1)
    expect(found[0].cells).toHaveLength(8)
    expect(found[0].title).toContain('8')
  })
})
