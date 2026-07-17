import { describe, expect, it } from 'vitest'
import { previewModifyColumn, previewSetRange, buildActionPreview } from './previewBuilders'
import type { SheetData } from '@/types'

function sheetWithColB(): SheetData {
  return {
    id: 's1',
    name: 'T',
    cells: {
      B1: { value: 'Amount' },
      B2: { value: 10 },
      B3: { value: 20 },
      A2: { value: 'a' },
    },
    columnWidths: {},
    rowHeights: {},
    charts: [],
  }
}

describe('previewBuilders', () => {
  it('previewSetRange builds old→new changes', () => {
    const sheet = sheetWithColB()
    const changes = previewSetRange(sheet, 'A2', [['x', 99], ['y', 100]])
    expect(changes.length).toBe(4)
    expect(changes.find((c) => c.cell === 'B2')).toMatchObject({
      oldValue: 10,
      newValue: 99,
    })
  })

  it('previewModifyColumn multiplies numeric cells', () => {
    const sheet = sheetWithColB()
    const changes = previewModifyColumn(
      sheet,
      'B',
      'multiply',
      1.1,
      (_r, c) => (c === 1 ? String(sheet.cells[`B${_r + 1}`]?.value ?? '') : ''),
    )
    // B1 is header text — skipped; B2/B3 numeric
    expect(changes.some((c) => c.cell === 'B2' && c.newValue === 11)).toBe(true)
    expect(changes.some((c) => c.cell === 'B3' && c.newValue === 22)).toBe(true)
  })

  it('buildActionPreview wires modify_column', () => {
    const sheet = sheetWithColB()
    const preview = buildActionPreview(
      'modify_column',
      { column: 'B', operation: 'multiply', factor: 2 },
      sheet,
      (r, c) => (c === 1 ? String(sheet.cells[`B${r + 1}`]?.value ?? '') : ''),
    )
    expect(preview?.changes.length).toBeGreaterThan(0)
  })
})
