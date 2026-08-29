import { describe, it, expect } from 'vitest'
import { workbookHasContent } from './workbookGuard'
import type { WorkbookData } from '@/types'

function makeWorkbook(): WorkbookData {
  return {
    id: 'wb-1',
    name: 'Test',
    sheets: [
      {
        id: 's1',
        name: 'Sheet1',
        cells: {},
        columnWidths: {},
        rowHeights: {},
      },
    ],
    activeSheetId: 's1',
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('workbookHasContent', () => {
  it('is false for a completely empty workbook', () => {
    expect(workbookHasContent(makeWorkbook())).toBe(false)
  })

  it('is true when a cell has a plain value', () => {
    const wb = makeWorkbook()
    wb.sheets[0].cells.A1 = { value: 'hello' }
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('is true when a cell has a numeric value (0 is content)', () => {
    const wb = makeWorkbook()
    wb.sheets[0].cells.A1 = { value: 0 }
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('is true when a cell has a formula but no value', () => {
    const wb = makeWorkbook()
    wb.sheets[0].cells.B2 = { value: null, formula: '=SUM(A1:A5)' }
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('is true when only column widths were customized', () => {
    const wb = makeWorkbook()
    wb.sheets[0].columnWidths[3] = 240
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('is true when only row heights were customized', () => {
    const wb = makeWorkbook()
    wb.sheets[0].rowHeights[10] = 48
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('is false when cells exist but only with empty values', () => {
    const wb = makeWorkbook()
    wb.sheets[0].cells.A1 = { value: null }
    wb.sheets[0].cells.B1 = { value: null }
    expect(workbookHasContent(wb)).toBe(false)
  })

  it('is true when cells are merged', () => {
    const wb = makeWorkbook()
    wb.sheets[0].mergedCells = ['A1:B2']
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('is true when a chart exists (with otherwise empty cells)', () => {
    const wb = makeWorkbook()
    wb.sheets[0].cells.A1 = { value: 1 }
    wb.sheets[0].cells.B1 = { value: 2 }
    wb.sheets[0].charts = [
      {
        id: 'c1',
        type: 'bar',
        title: 'Chart',
        dataRange: 'A1:B1',
        position: { x: 0, y: 0, width: 300, height: 200 },
      },
    ]
    expect(workbookHasContent(wb)).toBe(true)
  })

  it('scans every sheet', () => {
    const wb = makeWorkbook()
    wb.sheets.push({ id: 's2', name: 'Sheet2', cells: { C3: { value: null, formula: '=1+1' } }, columnWidths: {}, rowHeights: {} })
    expect(workbookHasContent(wb)).toBe(true)
  })
})