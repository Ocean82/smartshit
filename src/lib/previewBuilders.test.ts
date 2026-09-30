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

  it('buildActionPreview wires apply_formula', () => {
    const sheet = sheetWithColB()
    const preview = buildActionPreview(
      'apply_formula',
      { cell: 'B4', formula: '=SUM(B2:B3)' },
      sheet,
      () => '',
    )
    expect(preview?.changes).toEqual([
      expect.objectContaining({
        cell: 'B4',
        newFormula: '=SUM(B2:B3)',
      }),
    ])
  })
})

describe('previewBuilders — clear_sheet', () => {
  function sheetWithContent(): SheetData {
    return {
      id: 's1',
      name: 'T',
      cells: {
        A1: { value: 'Item' },
        B1: { value: 10 },
        B2: { value: null, formula: '=B1*2' },
        C3: { value: null, format: { bold: true } },
        D4: { value: null },
      },
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }
  }

  it('previews every cell that actually holds content', () => {
    const preview = buildActionPreview('clear_sheet', {}, sheetWithContent(), () => '')
    const cells = preview?.changes.map((c) => c.cell)
    expect(cells).toEqual(['A1', 'B1', 'B2', 'C3'])
    expect(preview?.changes.find((c) => c.cell === 'B2')).toMatchObject({
      oldFormula: '=B1*2',
      newValue: null,
    })
  })

  it('always returns a preview object so the review gate can be satisfied', () => {
    const empty: SheetData = { id: 's1', name: 'T', cells: {}, columnWidths: {}, rowHeights: {}, charts: [] }
    const preview = buildActionPreview('clear_sheet', {}, empty, () => '')
    expect(preview).toEqual({ changes: [] })
  })

  it('ignores model-supplied previewChanges for other tools', () => {
    const sheet = sheetWithContent()
    const preview = buildActionPreview(
      'clear_sheet',
      { previewChanges: [{ cell: 'A1', oldValue: 'x', newValue: 'y' }] },
      sheet,
      () => '',
    )
    expect(preview?.changes.map((c) => c.cell)).toEqual(['A1', 'B1', 'B2', 'C3'])
  })

  it('still honours the locally produced clean_sheet_data preview', () => {
    const sheet = sheetWithContent()
    const preview = buildActionPreview(
      'clean_sheet_data',
      { previewChanges: [{ cell: 'A1', oldValue: 'x', newValue: 'y' }] },
      sheet,
      () => '',
    )
    expect(preview?.changes).toEqual([{ cell: 'A1', oldValue: 'x', newValue: 'y' }])
  })
})
