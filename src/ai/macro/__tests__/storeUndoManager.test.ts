import { describe, it, expect } from 'vitest'
import { createSharedSnapshotUndoManager } from '../storeUndoManager'
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
