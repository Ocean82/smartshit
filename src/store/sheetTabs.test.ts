import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

describe('sheet tab actions', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Tabs')
    wb.sheets[0].name = 'Alpha'
    wb.sheets[0].cells['A1'] = { value: 1 }
    useStore.setState({
      workbook: wb,
      activeSheetId: wb.sheets[0].id,
      undoStack: [],
      redoStack: [],
    })
    useStore.getState().addSheet('Beta')
    useStore.getState().setActiveSheet(wb.sheets[0].id)
  })

  it('duplicates a sheet after the source with a unique name', () => {
    const store = useStore.getState()
    const id = store.workbook.sheets[0].id
    store.duplicateSheet(id)
    const names = useStore.getState().workbook.sheets.map((s) => s.name)
    expect(names).toEqual(['Alpha', 'Alpha (2)', 'Beta'])
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe(1)
  })

  it('renames a sheet, rewrites references to it, and undoes both', async () => {
    const store = useStore.getState()
    const [alpha, beta] = store.workbook.sheets.map((s) => s.id)
    store.setActiveSheet(beta)
    useStore.getState().setCellValue('A1', null, '=Alpha!A1*2')
    expect(useStore.getState().renameSheet(alpha, 'Q1 Data')).toEqual({ ok: true })
    const betaSheet = () => useStore.getState().workbook.sheets.find((s) => s.id === beta)!
    expect(betaSheet().cells['A1']?.formula).toBe("='Q1 Data'!A1*2")
    await Promise.resolve()
    useStore.getState().undo()
    expect(useStore.getState().workbook.sheets.find((s) => s.id === alpha)?.name).toBe('Alpha')
    expect(betaSheet().cells['A1']?.formula).toBe('=Alpha!A1*2')
  })

  it('rejects invalid or duplicate sheet names without changing anything', () => {
    const store = useStore.getState()
    const alpha = store.workbook.sheets[0].id
    const undoDepth = store.undoStack.length
    expect(store.renameSheet(alpha, 'beta')).toMatchObject({ ok: false, error: expect.stringContaining('already exists') })
    expect(store.renameSheet(alpha, 'A/B')).toMatchObject({ ok: false })
    expect(useStore.getState().workbook.sheets[0].name).toBe('Alpha')
    expect(useStore.getState().undoStack.length).toBe(undoDepth)
  })

  it('moves a sheet to a new index', () => {
    const store = useStore.getState()
    const beta = store.workbook.sheets[1].id
    store.moveSheet(beta, 0)
    expect(useStore.getState().workbook.sheets.map((s) => s.name)).toEqual(['Beta', 'Alpha'])
  })

  it('sets and clears tab color', () => {
    const store = useStore.getState()
    const id = store.workbook.sheets[0].id
    store.setSheetTabColor(id, '#2979FF')
    expect(useStore.getState().workbook.sheets[0].tabColor).toBe('#2979FF')
    store.setSheetTabColor(id, null)
    expect(useStore.getState().workbook.sheets[0].tabColor).toBeUndefined()
  })

  it('hides a sheet and activates a neighbor; refuses last visible', () => {
    const store = useStore.getState()
    const alpha = store.workbook.sheets[0].id
    const beta = store.workbook.sheets[1].id
    store.hideSheet(alpha)
    expect(useStore.getState().workbook.sheets[0].hidden).toBe(true)
    expect(useStore.getState().activeSheetId).toBe(beta)
    store.hideSheet(beta)
    expect(useStore.getState().workbook.sheets[1].hidden).toBeUndefined()
  })

  it('unhides a sheet and activates it', () => {
    const store = useStore.getState()
    const alpha = store.workbook.sheets[0].id
    store.hideSheet(alpha)
    store.unhideSheet(alpha)
    expect(useStore.getState().workbook.sheets[0].hidden).toBeUndefined()
    expect(useStore.getState().activeSheetId).toBe(alpha)
  })
})
