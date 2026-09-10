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

describe('clearRangeFormat', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Clear Format Test')
    const sheet = wb.sheets[0]
    sheet.cells['A1'] = {
      value: 42,
      formula: '=21*2',
      format: { bold: true, fontColor: '#ff0000', bgColor: '#ffff00', numberFormat: '0.00' },
      validation: { type: 'number', min: 0, message: 'Must be positive' },
    }
    sheet.cells['B1'] = {
      value: 'keep me',
      format: { italic: true, textWrap: true },
    }
    sheet.cells['C1'] = { value: 'no format' }

    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 },
      additionalSelections: [],
      undoStack: [],
      redoStack: [],
    })
  })

  it('removes format but keeps value, formula, and validation', () => {
    useStore.getState().clearRangeFormat()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['A1'].value).toBe(42)
    expect(sheet.cells['A1'].formula).toBe('=21*2')
    expect(sheet.cells['A1'].validation).toEqual({ type: 'number', min: 0, message: 'Must be positive' })
    expect(sheet.cells['A1'].format).toBeUndefined()
    expect(sheet.cells['B1'].value).toBe('keep me')
    expect(sheet.cells['B1'].format).toBeUndefined()
    expect(sheet.cells['C1'].format).toBeUndefined()
  })

  it('is undoable', () => {
    const before = JSON.stringify(useStore.getState().workbook)
    useStore.getState().clearRangeFormat()
    expect(useStore.getState().getActiveSheet().cells['A1'].format).toBeUndefined()
    useStore.getState().undo()
    expect(JSON.stringify(useStore.getState().workbook)).toBe(before)
  })
})
