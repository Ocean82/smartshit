import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook, refToCell } from '@/engine/spreadsheet'

describe('setRangeFormat history and border merge', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Format Test')
    const sheet = wb.sheets[0]
    sheet.cells['A1'] = {
      value: 1,
      format: { borders: { left: '2px solid #111', bottom: '2px solid #111' } },
    }
    sheet.cells['B1'] = {
      value: 2,
      format: { borders: { right: '2px solid #222' } },
    }

    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 },
      undoStack: [],
      redoStack: [],
    })
  })

  it('merges only the changed border side across a range', () => {
    const store = useStore.getState()
    store.setRangeFormat({ borders: { top: '1px solid #000' } })

    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['A1'].format?.borders).toEqual({
      left: '2px solid #111',
      bottom: '2px solid #111',
      top: '1px solid #000',
    })
    expect(sheet.cells['B1'].format?.borders).toEqual({
      right: '2px solid #222',
      top: '1px solid #000',
    })
  })

  it('undo restores workbook after setRangeFormat', () => {
    const store = useStore.getState()
    const before = JSON.stringify(store.workbook)
    store.setRangeFormat({ bold: true })
    expect(useStore.getState().getActiveSheet().cells['A1'].format?.bold).toBe(true)

    store.undo()
    expect(JSON.stringify(useStore.getState().workbook)).toBe(before)
  })

  it('clears a border side with empty string without wiping other sides', () => {
    const store = useStore.getState()
    store.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    store.setRangeFormat({ borders: { left: '' } })

    const a1 = useStore.getState().getActiveSheet().cells[refToCell(0, 0)]
    expect(a1.format?.borders?.left).toBe('')
    expect(a1.format?.borders?.bottom).toBe('2px solid #111')
  })
})
