import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { MIN_COL_WIDTH, MAX_COL_WIDTH } from '@/lib/colLayout'

describe('column width resize with history', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Col Resize Test')
    const sheet = wb.sheets[0]
    sheet.columnWidths = { 5: 150 }

    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      undoStack: [],
      redoStack: [],
    })
  })

  it('sets a column width override', () => {
    useStore.getState().setColumnWidth(5, 200)
    expect(useStore.getState().getActiveSheet().columnWidths).toEqual({ 5: 200 })
  })

  it('clamps and no-ops', () => {
    useStore.getState().setColumnWidth(5, 99999)
    expect(useStore.getState().getActiveSheet().columnWidths).toEqual({ 5: MAX_COL_WIDTH })
    useStore.getState().setColumnWidth(0, 1)
    expect(useStore.getState().getActiveSheet().columnWidths[0]).toBe(MIN_COL_WIDTH)
    const before = useStore.getState().undoStack.length
    useStore.getState().setColumnWidth(5, MAX_COL_WIDTH)
    expect(useStore.getState().undoStack.length).toBe(before)
  })

  it('round-trips through undo/redo', () => {
    const store = useStore.getState()
    store.setColumnWidth(5, 220)
    store.undo()
    expect(useStore.getState().getActiveSheet().columnWidths).toEqual({ 5: 150 })
    store.redo()
    expect(useStore.getState().getActiveSheet().columnWidths).toEqual({ 5: 220 })
  })

  it('shifts widths on insert/delete column', () => {
    useStore.getState().insertColumn(2)
    expect(useStore.getState().getActiveSheet().columnWidths).toEqual({ 6: 150 })
    useStore.getState().setColumnWidth(1, 90)
    useStore.getState().deleteColumn(1)
    expect(useStore.getState().getActiveSheet().columnWidths).toEqual({ 5: 150 })
  })
})
