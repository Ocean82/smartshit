import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { MIN_ROW_HEIGHT, MAX_ROW_HEIGHT } from '@/lib/rowLayout'

describe('row height resize with history', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Row Resize Test')
    const sheet = wb.sheets[0]
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
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: MAX_ROW_HEIGHT })
  })

  it('clamps undersized heights', () => {
    useStore.getState().setRowHeight(5, 1)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: MIN_ROW_HEIGHT })
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

  it('shifts height overrides down when inserting a row above them', () => {
    useStore.getState().insertRow(2)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 6: 50 })
  })

  it('drops the deleted row override and shifts later ones up', () => {
    useStore.getState().setRowHeight(7, 80)
    useStore.getState().deleteRow(5)
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 6: 80 })
  })
})
