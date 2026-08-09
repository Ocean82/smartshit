import { describe, it, expect } from 'vitest'
import { createStoreUndoManager, createSharedSnapshotUndoManager } from '../storeUndoManager'
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

  it('rollback does not re-clone — restored object is the begin snapshot', () => {
    let workbook = makeWorkbook('before')
    let restored: WorkbookData | null = null
    const undo = createStoreUndoManager({
      getWorkbook: () => workbook,
      restoreWorkbook: (wb) => {
        restored = wb
        workbook = wb
      },
    })

    const gid = undo.beginGroup('test')
    const beginSnap = restored // still null
    void beginSnap
    workbook = makeWorkbook('mutated')
    undo.rollbackGroup(gid)
    expect(restored).not.toBeNull()
    expect(restored!.sheets[0].cells.A1?.value).toBe('before')
    // Second rollback is a no-op (snapshot already transferred)
    const afterFirst = restored
    undo.rollbackGroup(gid)
    expect(restored).toBe(afterFirst)
  })
})

describe('createSharedSnapshotUndoManager', () => {
  it('reuses the caller snapshot on rollback without a begin clone', () => {
    const before = makeWorkbook('before')
    let workbook = makeWorkbook('mutated')
    const undo = createSharedSnapshotUndoManager({
      before,
      restoreWorkbook: (wb) => { workbook = wb },
    })

    const gid = undo.beginGroup('macro')
    undo.rollbackGroup(gid)
    expect(workbook).toBe(before)
    expect(workbook.sheets[0].cells.A1?.value).toBe('before')
  })
})
