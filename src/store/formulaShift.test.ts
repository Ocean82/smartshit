import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptySheet, createEmptyWorkbook } from '@/engine/spreadsheet'

describe('formula refs remapped on insert/delete', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Formula Shift')
    const sheet = wb.sheets[0]
    sheet.name = 'Sheet 1'
    sheet.cells['A1'] = { value: 1 }
    sheet.cells['A5'] = { value: 5 }
    sheet.cells['B2'] = { value: null, formula: '=A1+A5' }
    sheet.cells['C3'] = { value: null, formula: '=$A$5' }
    sheet.cells['D1'] = { value: null, formula: "='Sheet 1'!A5" }

    const other = createEmptySheet('Sheet 2')
    other.cells['A1'] = { value: null, formula: "='Sheet 1'!A5" }
    other.cells['B1'] = { value: null, formula: '=A5' }
    wb.sheets.push(other)

    useStore.setState({
      workbook: wb,
      activeSheetId: sheet.id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
      undoStack: [],
      redoStack: [],
    })
  })

  it('insertRow shifts targets below the insert without touching A1', () => {
    useStore.getState().insertRow(0)
    const sheet = useStore.getState().getActiveSheet()
    // B2 moved to B3; A5→A6; A1 stays
    expect(sheet.cells['B3']?.formula).toBe('=A1+A6')
    expect(sheet.cells['C4']?.formula).toBe('=$A$6')
    expect(sheet.cells['D1']?.formula).toBe("='Sheet 1'!A6")
    expect(sheet.cells['B2']).toBeUndefined()

    const other = useStore.getState().workbook.sheets.find((s) => s.name === 'Sheet 2')!
    expect(other.cells['A1']?.formula).toBe("='Sheet 1'!A6")
    expect(other.cells['B1']?.formula).toBe('=A5')
  })

  it('deleteRow turns refs to the deleted row into #REF!', () => {
    useStore.getState().deleteRow(0) // delete A1's row
    const sheet = useStore.getState().getActiveSheet()
    // B2 was on row 1 → now B1; A5 was row 4 → A4
    expect(sheet.cells['B1']?.formula).toBe('=#REF!+A4')

    const other = useStore.getState().workbook.sheets.find((s) => s.name === 'Sheet 2')!
    expect(other.cells['A1']?.formula).toBe("='Sheet 1'!A4")
  })
})