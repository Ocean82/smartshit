import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

describe('mergedCells remapped on insert/delete', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Merge Shift')
    const sheet = wb.sheets[0]
    sheet.cells['A1'] = { value: 'head' }
    sheet.cells['B2'] = { value: 2 }
    sheet.mergedCells = ['A1:B2', 'D5:E6']
    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      undoStack: [],
      redoStack: [],
    })
  })

  it('insertRow expands straddling merges and shifts those below', () => {
    useStore.getState().insertRow(0)
    expect(useStore.getState().getActiveSheet().mergedCells).toEqual(['A1:B3', 'D6:E7'])
  })

  it('deleteRow shrinks and shifts merges', () => {
    useStore.getState().deleteRow(1)
    expect(useStore.getState().getActiveSheet().mergedCells).toEqual(['A1:B1', 'D4:E5'])
  })

  it('insertColumn remaps horizontally', () => {
    useStore.getState().insertColumn(0)
    expect(useStore.getState().getActiveSheet().mergedCells).toEqual(['A1:C2', 'E5:F6'])
  })

  it('deleteColumn drops axis-only merges and shifts the rest', () => {
    useStore.setState((s) => {
      s.workbook.sheets[0].mergedCells = ['A1:A2', 'C1:D1']
    })
    useStore.getState().deleteColumn(0)
    expect(useStore.getState().getActiveSheet().mergedCells).toEqual(['B1:C1'])
  })
})
