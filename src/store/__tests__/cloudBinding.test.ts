/**
 * Per-file cloud binding — store behavior.
 *
 * Verifies the fix at the store layer: the cloud workbook binding lives on the
 * active FileItem, switching files changes which binding is effective, and the
 * import / New Workbook paths clear the binding so autosave can't overwrite the
 * file's old cloud workbook with unrelated content.
 *
 * Requirements tested: 3.1, 3.2, 3.4, 5.2
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '@/store/useStore'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import type { FileItem, WorkbookData } from '@/types'

function file(id: string, workbookId: string, cloudWorkbookId?: string): FileItem {
  return {
    id,
    name: id,
    type: 'file',
    parentId: null,
    workbookId,
    cloudWorkbookId,
    createdAt: 0,
    updatedAt: 0,
  }
}

function activeCloudId(): string | undefined {
  const s = useStore.getState()
  return s.files.find((f) => f.id === s.activeFileId)?.cloudWorkbookId
}

beforeEach(() => {
  const budget = createEmptyWorkbook('Budget')
  const groceries = createEmptyWorkbook('Groceries')
  useStore.getState().engine.loadWorkbook(budget)
  useStore.setState({
    workbook: budget,
    activeSheetId: budget.sheets[0].id,
    workbookSlots: { [groceries.id]: groceries },
    files: [
      file('f-budget', budget.id, 'cloud-A'),
      file('f-groceries', groceries.id, 'cloud-B'),
    ],
    activeFileId: 'f-budget',
  })
})

describe('setActiveFileCloudId', () => {
  it('sets and clears the active file binding only', () => {
    useStore.getState().setActiveFileCloudId('cloud-X')
    expect(activeCloudId()).toBe('cloud-X')
    // The other file is untouched.
    expect(useStore.getState().files.find((f) => f.id === 'f-groceries')?.cloudWorkbookId).toBe('cloud-B')

    useStore.getState().setActiveFileCloudId(null)
    expect(activeCloudId()).toBeUndefined()
  })
})

describe('switching files changes the effective binding', () => {
  it('the active cloud id follows activeFileId with no leftover global', () => {
    expect(activeCloudId()).toBe('cloud-A')
    useStore.getState().openFile('f-groceries')
    expect(activeCloudId()).toBe('cloud-B')
    useStore.getState().openFile('f-budget')
    expect(activeCloudId()).toBe('cloud-A')
  })
})

describe('import clears the active file cloud binding', () => {
  it('so autosave will not overwrite the old cloud workbook', () => {
    expect(activeCloudId()).toBe('cloud-A')
    const imported: WorkbookData = createEmptyWorkbook('Imported')
    useStore.getState().importWorkbook(imported, { fileName: 'imported.xlsx' })
    expect(activeCloudId()).toBeUndefined()
  })
})

describe('New Workbook clears the active file cloud binding', () => {
  it('the fresh workbook is not the old cloud workbook', () => {
    expect(activeCloudId()).toBe('cloud-A')
    useStore.getState().initWorkbook('Fresh')
    expect(activeCloudId()).toBeUndefined()
  })
})
