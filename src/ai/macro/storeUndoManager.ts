import type { UndoManager } from '@/ai/nlp/types'
import type { WorkbookData } from '@/types'
import { v4 as uuid } from 'uuid'

export function createStoreUndoManager(deps: {
  getWorkbook: () => WorkbookData
  /** Full replace of workbook state (must also reload formula engine if callers need it) */
  restoreWorkbook: (workbook: WorkbookData) => void
}): UndoManager {
  const snapshots = new Map<string, WorkbookData>()
  return {
    beginGroup(_label: string): string {
      const id = uuid()
      snapshots.set(id, structuredClone(deps.getWorkbook()))
      return id
    },
    commitGroup(groupId: string): void {
      snapshots.delete(groupId)
    },
    rollbackGroup(groupId: string): void {
      const snap = snapshots.get(groupId)
      if (snap) deps.restoreWorkbook(structuredClone(snap))
      snapshots.delete(groupId)
    },
  }
}
