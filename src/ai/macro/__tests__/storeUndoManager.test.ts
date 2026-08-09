import { describe, it, expect } from 'vitest'
import { createStoreUndoManager } from '../storeUndoManager'
import type { WorkbookData } from '@/types'

function makeWorkbook(marker: string): WorkbookData {
  return {
    id: 'wb1',
    name: 'Test',
    activeSheetId: 's1',
    createdAt: 1,
    updatedAt: 1,
    sheets: [{
      id: 's1',
      name: 'Sheet1',
      cells: { A1: { value: marker } },
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }],
  }
}

describe('createStoreUndoManager', () => {
  it('beginGroup + rollbackGroup restores the snapshot', () => {
    let workbook = makeWorkbook('before')
    const undo = createStoreUndoManager({
      getWorkbook: () => workbook,
      restoreWorkbook: (wb) => { workbook = wb },
    })

    const gid = undo.beginGroup('test')
    workbook = makeWorkbook('after-mutation')
    expect(workbook.sheets[0].cells.A1?.value).toBe('after-mutation')

    undo.rollbackGroup(gid)
    expect(workbook.sheets[0].cells.A1?.value).toBe('before')
  })

  it('commitGroup clears the snapshot so rollback is a no-op', () => {
    let workbook = makeWorkbook('before')
    const undo = createStoreUndoManager({
      getWorkbook: () => workbook,
      restoreWorkbook: (wb) => { workbook = wb },
    })

    const gid = undo.beginGroup('test')
    workbook = makeWorkbook('after')
    undo.commitGroup(gid)
    undo.rollbackGroup(gid)
    expect(workbook.sheets[0].cells.A1?.value).toBe('after')
  })
})
