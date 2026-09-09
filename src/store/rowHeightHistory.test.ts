import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

describe('row height resize with history', () => {
  let sheetId: string

  beforeEach(() => {
    const wb = createEmptyWorkbook('Row Resize Test')
    const sheet = wb.sheets[0]
    sheetId = sheet.id
    sheet.rowHeights = { 5: 50 }

    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      undoStack: [],
      redoStack: [],
    })
  })

  it('sets a row height override on the active sheet', () => {
    useStore.getState().setRowHeight(5, 90)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 90 })
  })

  it('adds an override to an existing map without dropping others', () => {
    useStore.getState().setRowHeight(0, 44)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 0: 44, 5: 50 })
  })

  it('clamps oversized heights', () => {
    useStore.getState().setRowHeight(5, 99999)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 400 })
  })

  it('ignores no-op changes (no history entry pushed)', () => {
    const before = useStore.getState().undoStack.length
    useStore.getState().setRowHeight(5, 50)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 50 })
    expect(useStore.getState().undoStack.length).toBe(before)
  })

  it('round-trips through undo/redo', () => {
    const store = useStore.getState()
    store.setRowHeight(5, 90)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 90 })

    store.undo()
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 50 })

    store.redo()
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 90 })
  })
})