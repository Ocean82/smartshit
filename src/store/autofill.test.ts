import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

describe('autofillTo', () => {
  let sheetId: string

  beforeEach(() => {
    const wb = createEmptyWorkbook('Autofill Test')
    sheetId = wb.sheets[0].id
    useStore.setState({
      workbook: wb,
      activeSheetId: sheetId,
      selection: null,
      undoStack: [],
      redoStack: [],
    })
  })

  const cells = () => useStore.getState().getActiveSheet().cells

  const sel = (startRow: number, startCol: number, endRow: number, endCol: number) =>
    useStore.getState().setSelection({ startRow, startCol, endRow, endCol })

  it('extends a numeric linear series right and updates the selection', () => {
    cells()['A1'] = { value: 1 }
    cells()['B1'] = { value: 2 }
    sel(0, 0, 0, 1)
    useStore.getState().autofillTo(0, 3)
    expect(cells()['C1']?.value).toBe(3)
    expect(cells()['D1']?.value).toBe(4)
    expect(useStore.getState().selection).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 3 })
  })

  it('copies a single number down (step 0)', () => {
    cells()['A1'] = { value: 5 }
    sel(0, 0, 0, 0)
    useStore.getState().autofillTo(3, 0)
    expect(cells()['A2']?.value).toBe(5)
    expect(cells()['A3']?.value).toBe(5)
    expect(cells()['A4']?.value).toBe(5)
  })

  it('extrapolates a vertical numeric series', () => {
    cells()['A1'] = { value: 1 }
    cells()['A2'] = { value: 3 }
    sel(0, 0, 1, 0)
    useStore.getState().autofillTo(3, 0)
    expect(cells()['A3']?.value).toBe(5)
    expect(cells()['A4']?.value).toBe(7)
  })

  it('increments date serials', () => {
    cells()['A1'] = { value: 45658, format: { numberFormat: 'date' } }
    sel(0, 0, 0, 0)
    useStore.getState().autofillTo(2, 0)
    expect(cells()['A2']?.value).toBe(45659)
    expect(cells()['A3']?.value).toBe(45660)
  })

  it('increments text-with-trailing-number', () => {
    cells()['A1'] = { value: 'Item 1' }
    sel(0, 0, 0, 0)
    useStore.getState().autofillTo(0, 3)
    expect(cells()['B1']?.value).toBe('Item 2')
    expect(cells()['C1']?.value).toBe('Item 3')
    expect(cells()['D1']?.value).toBe('Item 4')
  })

  it('repeats a block right (A,B,C → A,B,C)', () => {
    cells()['A1'] = { value: 'A' }
    cells()['B1'] = { value: 'B' }
    cells()['C1'] = { value: 'C' }
    sel(0, 0, 0, 2)
    useStore.getState().autofillTo(0, 5)
    expect(cells()['D1']?.value).toBe('A')
    expect(cells()['E1']?.value).toBe('B')
    expect(cells()['F1']?.value).toBe('C')
  })

  it('adjusts relative formula refs when filling right', () => {
    cells()['A1'] = { value: 1 }
    cells()['B1'] = { value: 2 }
    cells()['A2'] = { value: 3, formula: '=A1+B1' }
    sel(1, 0, 1, 0)
    useStore.getState().autofillTo(1, 2)
    expect(cells()['B2']?.formula).toBe('=B1+C1')
    expect(cells()['C2']?.formula).toBe('=C1+D1')
  })

  it('adjusts relative formula refs down (row delta)', () => {
    cells()['A1'] = { value: 1 }
    cells()['A2'] = { value: 3, formula: '=A1*2' }
    sel(1, 0, 1, 0)
    useStore.getState().autofillTo(3, 0)
    expect(cells()['A3']?.formula).toBe('=A2*2')
    expect(cells()['A4']?.formula).toBe('=A3*2')
  })

  it('does not rewrite AI formulas', () => {
    cells()['A1'] = { value: 42, formula: '=AI.SUM(A1)' }
    sel(0, 0, 0, 0)
    useStore.getState().autofillTo(0, 1)
    expect(cells()['B1']?.formula).toBe('=AI.SUM(A1)')
  })

  it('combines row and col deltas for diagonal formula fill', () => {
    cells()['A1'] = { value: 1 }
    cells()['A2'] = { value: 3, formula: '=A1+10' }
    sel(1, 0, 1, 0)
    useStore.getState().autofillTo(2, 1)
    expect(cells()['B2']?.formula).toBe('=B1+10')
    expect(cells()['A3']?.formula).toBe('=A2+10')
    expect(cells()['B3']?.formula).toBe('=B2+10')
  })

  it('copies formats to filled cells', () => {
    cells()['A1'] = { value: 1, format: { bold: true } }
    sel(0, 0, 0, 0)
    useStore.getState().autofillTo(0, 1)
    expect(cells()['B1']?.format?.bold).toBe(true)
  })

  it('is a no-op when the drag stays inside the selection', () => {
    cells()['A1'] = { value: 1 }
    cells()['B1'] = { value: 2 }
    sel(0, 0, 0, 1)
    useStore.getState().autofillTo(0, 1)
    expect(cells()['C1']).toBeUndefined()
  })

  it('is a no-op when the destination overlaps a merged range', () => {
    const sheet = useStore.getState().getActiveSheet()
    sheet.mergedCells = ['B1:C2']
    cells()['A1'] = { value: 1 }
    sel(0, 0, 0, 0)
    useStore.getState().autofillTo(0, 1)
    expect(cells()['B1']?.value).toBeUndefined()
  })

  it('fills diagonally into the corner using extended columns then rows', () => {
    cells()['A1'] = { value: 1 }
    cells()['B1'] = { value: 2 }
    cells()['A2'] = { value: 10 }
    cells()['B2'] = { value: 20 }
    sel(0, 0, 1, 1)
    useStore.getState().autofillTo(1, 2)
    expect(cells()['C1']?.value).toBe(3)
    expect(cells()['C2']?.value).toBe(30)
  })
})