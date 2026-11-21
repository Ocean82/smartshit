/**
 * Per-file workbook model, through the real store: switching, per-file undo,
 * Trash (delete / restore / purge), rename, New Workbook, and import as a new
 * file. Pure helpers are covered in lib/fileWorkbooks.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '@/store/useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import type { FileItem } from '@/types'

const s = () => useStore.getState()
const liveFiles = () => s().files.filter((f) => f.deletedAt === undefined)
const fileNamed = (name: string) => s().files.find((f) => f.name === name)!
const cellA1 = () => s().getActiveSheet().cells.A1?.value ?? null

function fileFor(id: string, name: string, workbookId: string): FileItem {
  return { id, name, type: 'file', parentId: null, workbookId, createdAt: 0, updatedAt: 0 }
}

/** Edit A1 the way the UI does: history snapshot first, then the write. */
function edit(value: string | number) {
  s().pushHistory('edit')
  s().setCellValue('A1', value)
}

beforeEach(() => {
  const a = createEmptyWorkbook('Alpha')
  const b = createEmptyWorkbook('Beta')
  s().engine.loadWorkbook(a)
  useStore.setState({
    workbook: a,
    activeSheetId: a.sheets[0].id,
    workbookSlots: { [b.id]: b },
    files: [fileFor('fa', 'Alpha', a.id), fileFor('fb', 'Beta', b.id)],
    activeFileId: 'fa',
    undoStack: [],
    redoStack: [],
    undoSlots: {},
    selection: null,
    editingCell: null,
    activeFilters: [],
    activeSortConfig: null,
  })
})

describe('switching files', () => {
  it('keeps each file’s edits', () => {
    edit(111)
    s().openFile('fb')
    expect(cellA1()).toBeNull()
    edit(222)
    s().openFile('fa')
    expect(cellA1()).toBe(111)
    s().openFile('fb')
    expect(cellA1()).toBe(222)
  })

  it('keeps each file’s undo history instead of clearing or sharing it', () => {
    edit(1)
    edit(2)
    s().openFile('fb')
    expect(s().undoStack).toHaveLength(0) // Beta has no history of its own
    edit(9)
    s().openFile('fa')
    expect(s().undoStack).toHaveLength(2) // Alpha's history came back
    s().undo()
    expect(cellA1()).toBe(1) // and undo acts on Alpha, not on Beta's edit
    s().openFile('fb')
    expect(cellA1()).toBe(9)
    s().undo()
    expect(cellA1()).toBeNull()
  })

  it('clears selection, edit in progress and filters so they do not leak between files', () => {
    useStore.setState({
      selection: { startRow: 2, startCol: 2, endRow: 3, endCol: 3 },
      editingCell: 'C3',
      editValue: 'half typed',
      activeSortConfig: { column: 1, direction: 'asc' },
    })
    s().openFile('fb')
    expect(s().selection).toBeNull()
    expect(s().editingCell).toBeNull()
    expect(s().editValue).toBe('')
    expect(s().activeSortConfig).toBeNull()
  })
})

describe('Trash', () => {
  it('deleting keeps the workbook, and restoring brings back exactly its content', () => {
    s().openFile('fb')
    edit(42)
    s().deleteFile('fb') // active file is trashed: another opens
    expect(s().activeFileId).toBe('fa')
    expect(liveFiles().map((f) => f.id)).toEqual(['fa'])
    expect(s().files.find((f) => f.id === 'fb')!.deletedAt).toBeTypeOf('number')
    s().restoreFile('fb')
    s().openFile('fb')
    expect(cellA1()).toBe(42)
  })

  it('deleting the last live file opens a fresh one instead of a trashed one', () => {
    s().deleteFile('fb')
    s().deleteFile('fa')
    expect(liveFiles()).toHaveLength(1)
    expect(s().files.find((f) => f.id === s().activeFileId)!.deletedAt).toBeUndefined()
  })

  it('delete forever and empty Trash remove the workbook data', () => {
    s().deleteFile('fb')
    const betaWorkbookId = s().files.find((f) => f.id === 'fb')!.workbookId!
    expect(s().workbookSlots[betaWorkbookId]).toBeDefined()
    s().deleteFileForever('fb')
    expect(s().files.some((f) => f.id === 'fb')).toBe(false)
    expect(s().workbookSlots[betaWorkbookId]).toBeUndefined()

    s().deleteFile('fa')
    s().emptyTrash()
    expect(s().files.some((f) => f.id === 'fa')).toBe(false)
  })

  it('deleting a folder trashes its files and restoring the folder brings them back', () => {
    useStore.setState((st) => {
      st.files.push({ id: 'dir', name: 'Folder', type: 'folder', parentId: null, children: [], createdAt: 0, updatedAt: 0 })
      st.files.find((f) => f.id === 'fb')!.parentId = 'dir'
    })
    s().deleteFile('dir')
    expect(s().files.find((f) => f.id === 'fb')).toMatchObject({ trashedWith: 'dir' })
    s().restoreFile('dir')
    expect(s().files.find((f) => f.id === 'fb')!.deletedAt).toBeUndefined()
    expect(s().files.find((f) => f.id === 'fb')!.parentId).toBe('dir')
  })
})

describe('rename', () => {
  it('renames the file and its workbook together, open or not', () => {
    s().renameFile('fa', 'Alpha 2026')
    expect(s().workbook.name).toBe('Alpha 2026')
    s().renameFile('fb', 'Beta 2026')
    const beta = s().workbookSlots[s().files.find((f) => f.id === 'fb')!.workbookId!]
    expect(beta.name).toBe('Beta 2026')
    expect(s().files.find((f) => f.id === 'fb')!.name).toBe('Beta 2026')
  })

  it('ignores blank names', () => {
    s().renameFile('fa', '   ')
    expect(s().files.find((f) => f.id === 'fa')!.name).toBe('Alpha')
  })
})

describe('New Workbook and import never overwrite the open file', () => {
  it('New Workbook adds a blank file and leaves the current one intact', () => {
    edit(7)
    s().initWorkbook('New Workbook')
    expect(liveFiles()).toHaveLength(3)
    expect(s().files.find((f) => f.id === s().activeFileId)!.name).toBe('New Workbook')
    expect(cellA1()).toBeNull()
    s().openFile('fa')
    expect(cellA1()).toBe(7)
  })

  it('New Workbook numbers duplicate names', () => {
    s().initWorkbook('New Workbook')
    s().initWorkbook('New Workbook')
    expect(liveFiles().map((f) => f.name)).toEqual(['Alpha', 'Beta', 'New Workbook', 'New Workbook 2'])
  })

  it('import as a new file opens it under the file name and keeps the original', () => {
    edit(7)
    const imported = createEmptyWorkbook('ignored')
    imported.sheets[0].cells.A1 = { value: 'from file' }
    s().importWorkbook(imported, { fileName: 'Q3 numbers.xlsx', asNewFile: true })
    expect(s().files.find((f) => f.id === s().activeFileId)!.name).toBe('Q3 numbers')
    expect(s().workbook.name).toBe('Q3 numbers')
    expect(cellA1()).toBe('from file')
    s().openFile('fa')
    expect(cellA1()).toBe(7)
  })

  it('import without asNewFile replaces the open file and keeps its name', () => {
    const imported = createEmptyWorkbook('Imported')
    imported.sheets[0].cells.A1 = { value: 'replaced' }
    s().importWorkbook(imported, { fileName: 'other.xlsx' })
    expect(s().activeFileId).toBe('fa')
    expect(liveFiles()).toHaveLength(2)
    expect(cellA1()).toBe('replaced')
    expect(s().files.find((f) => f.id === 'fa')!.name).toBe('Alpha')
    expect(s().workbook.name).toBe('Alpha')
  })
})

describe('fileByName helper sanity', () => {
  it('finds a file by name', () => {
    expect(fileNamed('Alpha').id).toBe('fa')
  })
})
