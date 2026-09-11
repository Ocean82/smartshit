import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from './useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'

class FakeClipboardItem {
  data: Record<string, Blob | string>
  constructor(data: Record<string, Blob | string>) {
    this.data = data
  }

  async getType(type: string): Promise<Blob> {
    const d = this.data[type]
    if (d instanceof Blob) return d
    return new Blob([String(d)], { type })
  }
}

describe('clipboard', () => {
  beforeEach(() => {
    const wb = createEmptyWorkbook('Clipboard Test')
    wb.sheets[0].cells['A1'] = { value: 'src' }
    wb.sheets[0].cells['B1'] = { value: 2 }
    useStore.setState({
      workbook: wb,
      activeSheetId: wb.sheets[0].id,
      selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 },
      undoStack: [],
      redoStack: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copy writes a single ClipboardItem with TSV/CSV/text to the OS clipboard', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)

    useStore.getState().copy()
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))

    const items = write.mock.calls[0][0] as Array<{ getType: (t: string) => Promise<Blob> }>
    expect(items.length).toBe(1)
    const csv = await items[0].getType('text/csv').then((b) => b.text())
    expect(csv).toBe('src,2')
    const plain = await items[0].getType('text/plain').then((b) => b.text())
    expect(plain).toBe('src\t2')
    const tsv = await items[0].getType('text/tab-separated-values').then((b) => b.text())
    expect(tsv).toBe('src\t2')
  })

  it('copy applies formulas in all representations', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)

    useStore.getState().setCellValue('A1', 3, '=SUM(A1)')
    useStore.getState().copy()
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
    const items = write.mock.calls[0][0] as Array<{ getType: (t: string) => Promise<Blob> }>
    const text = await items[0].getType('text/plain').then((b) => b.text())
    expect(text).toBe('=SUM(A1)\t2')
  })

  it('copy swallows clipboard errors rather than throwing', () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)

    expect(() => useStore.getState().copy()).not.toThrow()
  })

  it('pasteFromClipboard with no OS clipboard falls back to the in-app clipboard', async () => {
    const readText = vi.fn().mockRejectedValue(new Error('nope'))
    vi.stubGlobal('navigator', { clipboard: { readText } })

    useStore.getState().copy()
    useStore.getState().setSelection({ startRow: 2, startCol: 2, endRow: 2, endCol: 2 })
    await useStore.getState().pasteFromClipboard()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['C3']?.value).toBe('src')
    expect(sheet.cells['D3']?.value).toBe(2)
  })

  it('pasteFromClipboard applies OS text one cell at a time from the selection origin', async () => {
    const readText = vi.fn().mockResolvedValue('os\tvalue\nline\ttwo')
    vi.stubGlobal('navigator', { clipboard: { readText } })

    useStore.getState().setSelection({ startRow: 4, startCol: 1, endRow: 4, endCol: 1 })
    await useStore.getState().pasteFromClipboard()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['B5']?.value).toBe('os')
    expect(sheet.cells['C5']?.value).toBe('value')
    expect(sheet.cells['B6']?.value).toBe('line')
    expect(sheet.cells['C6']?.value).toBe('two')
  })

  it('pasteFromClipboard coerces numeric and boolean text', async () => {
    const readText = vi.fn().mockResolvedValue('42\ttrue\nx\t')
    vi.stubGlobal('navigator', { clipboard: { readText } })

    await useStore.getState().pasteFromClipboard()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['A1']?.value).toBe(42)
    expect(sheet.cells['B1']?.value).toBe(true)
    expect(sheet.cells['A2']?.value).toBe('x')
    expect(sheet.cells['B2']).toBeUndefined()
  })

  it('cut does not delete until paste, then clears source in one undo', () => {
    const store = useStore.getState()
    store.cut()
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('src')
    expect(useStore.getState().clipboard?.mode).toBe('cut')
    expect(useStore.getState().copiedRange).toEqual(useStore.getState().selection)

    store.setSelection({ startRow: 2, startCol: 2, endRow: 2, endCol: 2 })
    store.paste()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['C3']?.value).toBe('src')
    expect(sheet.cells['D3']?.value).toBe(2)
    expect(sheet.cells['A1']).toBeUndefined()
    expect(sheet.cells['B1']).toBeUndefined()
    expect(useStore.getState().clipboard).toBeNull()
    expect(useStore.getState().copiedRange).toBeNull()

    store.undo()
    const undone = useStore.getState().getActiveSheet()
    expect(undone.cells['A1']?.value).toBe('src')
    expect(undone.cells['B1']?.value).toBe(2)
    expect(undone.cells['C3']).toBeUndefined()
  })

  it('copy keeps source; clearClipboard drops ants without mutating cells', () => {
    const store = useStore.getState()
    store.copy()
    expect(useStore.getState().clipboard?.mode).toBe('copy')
    store.clearClipboard()
    expect(useStore.getState().clipboard).toBeNull()
    expect(useStore.getState().copiedRange).toBeNull()
    expect(useStore.getState().getActiveSheet().cells['A1']?.value).toBe('src')
  })

  it('cut paste overlapping destination does not clear overwritten source cells', () => {
    const store = useStore.getState()
    store.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
    store.cut()
    store.setSelection({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 })
    store.paste()
    const sheet = useStore.getState().getActiveSheet()
    expect(sheet.cells['B1']?.value).toBe('src')
    expect(sheet.cells['C1']?.value).toBe(2)
    expect(sheet.cells['A1']).toBeUndefined()
  })
})
