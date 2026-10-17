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

  it('previewModifyColumn resolves a header name like the executor does', () => {
    const sheet = sheetWithColB()
    sheet.cells.A1 = { value: 'Item' }
    const changes = previewModifyColumn(
      sheet,
      'Amount',
      'multiply',
      2,
      (r, c) => String(sheet.cells[`${'AB'[c]}${r + 1}`]?.value ?? ''),
    )
    expect(changes.map((c) => c.cell).sort()).toEqual(['B2', 'B3'])
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

describe('previewBuilders — execute_macro (format-only)', () => {
  it('flattens format_cells steps into format-only changes', () => {
    const sheet = sheetWithColB()
    const preview = buildActionPreview(
      'execute_macro',
      {
        steps: [
          { tool: 'format_cells', params: { range: 'B1:B1', bold: true }, description: 'Header' },
          { tool: 'format_cells', params: { range: 'B2:B3', numberFormat: 'currency' }, description: 'Amount' },
          { tool: 'auto_fit', params: {}, description: 'Fit rows' },
        ],
      },
      sheet,
      () => '',
    )
    // format_cells cells (B1,B2,B3) plus the auto_fit layout anchor (A2, the
    // first populated cell) — every executable step is represented.
    expect(new Set(preview?.changes.map((c) => c.cell))).toEqual(new Set(['B1', 'B2', 'B3', 'A2']))
    // B2 keeps its old value AND formula — the preview preserves data, it does
    // not blank the cell (value-safe makeover contract).
    expect(preview?.changes.find((c) => c.cell === 'B2')).toMatchObject({
      oldValue: 10,
      newValue: 10,
      newFormula: undefined,
    })
  })

  it('preserves each cell value and formula instead of blanking it', () => {
    const sheet = sheetWithColB()
    const preview = buildActionPreview(
      'execute_macro',
      {
        steps: [
          { tool: 'format_cells', params: { range: 'A1:B3', bgColor: '#eee' }, description: 'Fill' },
        ],
      },
      sheet,
      () => '',
    )
    expect(preview?.changes.length).toBeGreaterThan(0)
    for (const change of preview!.changes) {
      const current = sheet.cells[change.cell]
      expect(change.newValue).toBe(current?.value ?? null)
      expect(change.newFormula).toBe(current?.formula)
    }
  })

  it('returns undefined for no steps, but previews a layout-only plan', () => {
    const sheet = sheetWithColB()
    expect(buildActionPreview('execute_macro', { steps: [] }, sheet, () => '')).toBeUndefined()
    // A layout-only (auto_fit) plan must still produce a non-empty preview so
    // the action cannot be applied with nothing shown (finding #1).
    const layoutPreview = buildActionPreview(
      'execute_macro',
      { steps: [{ tool: 'auto_fit', params: {}, description: 'Fit' }] },
      sheet,
      () => '',
    )
    expect(layoutPreview?.changes.length).toBeGreaterThan(0)
    const anchor = layoutPreview!.changes[0]
    const current = sheet.cells[anchor.cell]
    expect(anchor.newValue).toBe(current?.value ?? null)
    expect(anchor.newFormula).toBe(current?.formula)
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
