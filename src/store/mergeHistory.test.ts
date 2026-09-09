import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

describe('merge / unmerge cells with history', () => {
  let sheetId: string

  beforeEach(() => {
    const wb = createEmptyWorkbook('Merge Test')
    const sheet = wb.sheets[0]
    sheetId = sheet.id
    sheet.cells['A1'] = { value: 'head' }
    sheet.cells['B1'] = { value: 2 }
    sheet.cells['C2'] = { value: 9 }
    sheet.rowHeights = { 5: 50 }

    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 1, endCol: 2 },
      undoStack: [],
      redoStack: [],
    })
  })

  it('stores a canonical range ref for the selected region', () => {
    useStore.getState().mergeSelection()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.mergedCells).toEqual(['A1:C2'])
  })

  it('replaces overlapping merges instead of stacking duplicates', () => {
    const store = useStore.getState()
    store.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
    store.mergeSelection()
    store.setSelection({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 })
    store.mergeSelection()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.mergedCells).toEqual(['A1:C3'])
  })

  it('keeps disjoint merges alongside the new one', () => {
    const store = useStore.getState()
    store.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
    store.mergeSelection()
    store.setSelection({ startRow: 4, startCol: 4, endRow: 4, endCol: 5 })
    store.mergeSelection()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.mergedCells).toEqual(['A1:B1', 'E5:F5'])
  })

  it('unmergeSelection removes every merge overlapping the selection', () => {
    const store = useStore.getState()
    store.setSelection({ startRow: 0, startCol: 0, endRow: 1, endCol: 2 })
    store.mergeSelection()
    store.setSelection({ startRow: 4, startCol: 4, endRow: 4, endCol: 5 })
    store.mergeSelection()
    store.setSelection({ startRow: 1, startCol: 1, endRow: 1, endCol: 1 })
    store.unmergeSelection()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.mergedCells).toEqual(['E5:F5'])
  })

  it('undo restores mergedCells and rowHeights via the sheet patch', () => {
    const store = useStore.getState()
    const before = JSON.stringify(store.workbook)
    store.mergeSelection()
    expect(useStore.getState().getActiveSheet().mergedCells).toEqual(['A1:C2'])

    store.undo()
    expect(JSON.stringify(useStore.getState().workbook)).toBe(before)
  })

  it('redo re-applies the merge after an undo', () => {
    const store = useStore.getState()
    store.mergeSelection()
    store.undo()
    store.redo()
    expect(useStore.getState().getActiveSheet().mergedCells).toEqual(['A1:C2'])
  })

  it('row height edits round-trip through undo/redo', () => {
    const store = useStore.getState()
    const before = JSON.stringify(store.workbook)
    // Mutate a cell to give the history entry a diff at all.
    store.setCellValue('A1', 'x')
    store.pushHistory('Row height')
    useStore.setState((s) => {
      const sheet = s.workbook.sheets.find((sh) => sh.id === sheetId)
      if (sheet) sheet.rowHeights = { 5: 90 }
    })
    store.undo()
    expect(JSON.stringify(useStore.getState().workbook)).not.toBe(before)
    // Undo removed the height change (rowHeights captured as before = {5:50}? no:
    // rowHeights {} baseline vs before of {5:50}... verify the restored sheet has them).
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.rowHeights).toEqual({ 5: 50 })
    store.redo()
    expect(useStore.getState().getActiveSheet().rowHeights).toEqual({ 5: 90 })
  })
})