import { describe, expect, it } from 'vitest'
import { runAudit } from '../index'
import { buildFormulaCellIndex, extractRangeRefs, getErrorType, referencedFormulaCells } from '../utils'
import { cellToRef } from '@/engine/spreadsheet'
import type { SheetData } from '@/types'
import type { CellInfo } from '../types'

function sheetOf(cells: SheetData['cells'], name = 'Sheet1'): SheetData {
  return { id: 's', name, cells, columnWidths: {}, rowHeights: {}, charts: [] }
}

function circularFindings(cells: SheetData['cells'], name?: string) {
  return runAudit(sheetOf(cells, name), () => '').findings.filter((f) => f.ruleId === 'circular-refs')
}

function formulaInfo(cellId: string): CellInfo {
  const { row, col } = cellToRef(cellId)
  return { cellId, row, col, rawValue: null, formula: 'X', computedValue: '', type: 'formula' }
}

describe('auditor reference extraction', () => {
  it('detects a cycle through absolute references', () => {
    const findings = circularFindings({
      A1: { value: null, formula: '=$B$1+1' },
      B1: { value: null, formula: '=A1*2' },
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].cells.map((c) => c.cellId).sort()).toEqual(['A1', 'B1'])
  })

  it('detects a cycle through a range interior', () => {
    const findings = circularFindings({
      B5: { value: null, formula: '=SUM(A1:A10)' },
      A3: { value: null, formula: '=B5/2' },
    })
    expect(findings).toHaveLength(1)
  })

  it('detects a cycle through a self-qualified sheet reference', () => {
    const findings = circularFindings(
      {
        A1: { value: null, formula: "='My Sheet'!B1" },
        B1: { value: null, formula: '=A1' },
      },
      'My Sheet',
    )
    expect(findings).toHaveLength(1)
  })

  it('ignores function names, other sheets, and string literals', () => {
    expect(circularFindings({
      A1: { value: null, formula: '=LOG10(B1)' },
      B1: { value: null, formula: '=Other!A1 & "A1"' },
    })).toHaveLength(0)
  })

  it('handles a long fill-down chain without overflowing the stack', () => {
    const cells: SheetData['cells'] = { A1: { value: 1 } }
    for (let r = 2; r <= 20_000; r++) cells[`A${r}`] = { value: null, formula: `=A${r - 1}+1` }
    expect(circularFindings(cells)).toHaveLength(0)
  })

  it('finds formula cells inside ranges without expanding them', () => {
    const index = buildFormulaCellIndex(['A2', 'A5', 'C3', 'B100'].map(formulaInfo))
    expect(referencedFormulaCells('SUM(A1:B10)', 'S', index).sort()).toEqual(['A2', 'A5'])
    expect(referencedFormulaCells('SUM(A:A)', 'S', index).sort()).toEqual(['A2', 'A5'])
    expect(referencedFormulaCells('SUM(A1:XFD1048576)', 'S', index, 2)).toHaveLength(2)
  })

  it('recognizes newer engine error values', () => {
    expect(getErrorType('#CIRC!')).toBe('#CIRC!')
    expect(getErrorType('#spill!')).toBe('#SPILL!')
    expect(getErrorType('#CALC!')).toBe('#CALC!')
  })

  it('extractRangeRefs skips other-sheet, absolute, and quoted ranges', () => {
    expect(extractRangeRefs('SUM(A1:A5)+SUM(Other!B1:B5)+SUM($C$1:$C$5)&"D1:D5"')).toEqual([
      { range: 'A1:A5', start: 'A1', end: 'A5' },
    ])
  })
})
