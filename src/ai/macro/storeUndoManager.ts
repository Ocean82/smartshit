import type { UndoManager } from '@/ai/nlp/types'
import type { WorkbookData } from '@/types'
import { v4 as uuid } from 'uuid'

/**
 * Undo manager backed by full workbook snapshots.
 *
 * Cloning happens once in beginGroup. rollbackGroup hands that same snapshot
 * to restoreWorkbook and drops the map entry — no second structuredClone.
 */
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
      if (snap) {
        // Transfer ownership — do not re-clone; map entry is deleted next.
        deps.restoreWorkbook(snap)
      }
      snapshots.delete(groupId)
    },
  }
}

/**
 * Undo manager that reuses a caller-owned workbook snapshot.
 * Use when the caller already cloned `before` for history so beginGroup
 * does not pay for a second full-workbook structuredClone.
 */
export function createSharedSnapshotUndoManager(deps: {
  before: WorkbookData
  restoreWorkbook: (workbook: WorkbookData) => void
}): UndoManager {
  const active = new Set<string>()
  return {
    beginGroup(_label: string): string {
      const id = uuid()
      active.add(id)
      return id
    },
    commitGroup(groupId: string): void {
      active.delete(groupId)
    },
    rollbackGroup(groupId: string): void {
      if (!active.has(groupId)) return
      active.delete(groupId)
      // `before` stays pristine because step execution mutates store state,
      // not this snapshot object.
      deps.restoreWorkbook(deps.before)
    },
  }
}
