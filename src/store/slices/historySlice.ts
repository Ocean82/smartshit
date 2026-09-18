/**
 * History slice — undo/redo with patch-based snapshots.
 */

import type { WorkbookData } from '@/types'
import {
  diffWorkbooks,
  applyUndo,
  applyRedo,
  capUndoStack,
  newHistoryEntryId,
  type HistoryEntry,
} from '@/lib/historyDiff'
import type { SpreadsheetEngine } from '@/engine/spreadsheet'
import { MAX_UNDO_STACK, MAX_UNDO_STACK_BYTES, MIN_UNDO_STACK_ENTRIES } from '../storeTypes'

export interface HistoryState {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  workbook: WorkbookData
  activeSheetId: string
  engine: SpreadsheetEngine
}

export interface HistoryActions {
  pushHistory: (desc: string) => void
  undo: () => void
  redo: () => void
}

export function createHistoryActions(
  set: (fn: (s: HistoryState) => void) => void,
  get: () => HistoryState,
): HistoryActions {
  return {
    pushHistory: (desc) => {
      // ─── Optimized snapshot capture ──────────────────────────────────────
      // Instead of structuredClone(entireWorkbook) on every edit, we only deep
      // clone the active sheet's cells (where 99% of mutations land). This is
      // ~5-10x faster than cloning the entire workbook for large sheets.
      //
      // JSON.parse(JSON.stringify(...)) is used because:
      // 1. It's faster than structuredClone for plain JSON data in V8
      // 2. Workbook cells are guaranteed JSON-serializable (no Dates, Maps, etc.)
      // 3. It produces a clean deep copy with no shared references
      //
      // For structural changes (add/delete/reorder sheets), the diffWorkbooks
      // function detects the mismatch and stores a full structural patch.
      const wb = get().workbook

      // Fast path: clone only the active sheet's cells + columnWidths
      const beforeSnapshot: WorkbookData = {
        id: wb.id,
        name: wb.name,
        activeSheetId: wb.activeSheetId,
        createdAt: wb.createdAt,
        updatedAt: wb.updatedAt,
        sheets: wb.sheets.map((s) => {
          if (s.id === wb.activeSheetId) {
            // Deep clone only the active sheet's mutable data
            return {
              ...s,
              cells: structuredClone(s.cells),
              columnWidths: { ...s.columnWidths },
              rowHeights: s.rowHeights ? { ...s.rowHeights } : {},
              hiddenRows: s.hiddenRows ? { ...s.hiddenRows } : undefined,
              hiddenCols: s.hiddenCols ? { ...s.hiddenCols } : undefined,
              mergedCells: s.mergedCells ? [...s.mergedCells] : [],
              charts: s.charts ? [...s.charts] : [],
              images: s.images ? s.images.map((img) => ({ ...img })) : [],
            }
          }
          // Non-active sheets: shallow copy (structural changes handled by diffWorkbooks)
          return { ...s, cells: { ...s.cells } }
        }),
      }

      const entryId = newHistoryEntryId()
      set((s) => {
        s.undoStack.push({
          id: entryId,
          patch: {
            sheets: [],
            activeSheetIdBefore: beforeSnapshot.activeSheetId,
            activeSheetIdAfter: beforeSnapshot.activeSheetId,
            structuralBefore: beforeSnapshot,
            structuralAfter: undefined,
          },
          description: desc,
        })
        // Cheap entry-count cap only. The provisional entry still holds a full
        // structuralBefore snapshot here; byte-budget eviction runs in the
        // microtask below once the patch is finalized to its real (usually tiny)
        // size, so we don't over-evict based on the temporary snapshot.
        if (s.undoStack.length > MAX_UNDO_STACK) s.undoStack.shift()
        s.redoStack = []
      })

      // After the mutation happens (synchronously by the caller),
      // finalize THIS entry by id — never by description string (duplicate
      // labels in one tick would otherwise finalize the wrong top entry).
      queueMicrotask(() => {
        const afterWb = get().workbook
        const stack = get().undoStack
        const target = stack.find((e) => e.id === entryId)
        if (!target) return

        const patch = diffWorkbooks(beforeSnapshot, afterWb)
        set((s) => {
          const entry = s.undoStack.find((e) => e.id === entryId)
          if (entry) entry.patch = patch
          capUndoStack(s.undoStack, {
            maxEntries: MAX_UNDO_STACK,
            maxBytes: MAX_UNDO_STACK_BYTES,
            minEntries: MIN_UNDO_STACK_ENTRIES,
          })
        })
      })
    },

    undo: () => {
      const stack = get().undoStack
      if (stack.length === 0) return
      const entry = stack[stack.length - 1]

      // If the patch still has structuralBefore but hasn't been finalized
      // (microtask hasn't run yet), compute the diff now synchronously.
      let finalEntry = entry
      if (entry.patch.structuralBefore && entry.patch.structuralAfter === undefined && entry.patch.sheets.length === 0) {
        const afterWb = get().workbook
        const patch = diffWorkbooks(entry.patch.structuralBefore, afterWb)
        finalEntry = { id: entry.id, patch, description: entry.description }
      }

      const currentWb = get().workbook
      const restored = applyUndo(currentWb, finalEntry)
      const eng = get().engine
      eng.loadWorkbook(restored)

      set((s) => {
        s.redoStack.push(finalEntry)
        s.undoStack.pop()
        s.workbook = restored
        s.activeSheetId = restored.activeSheetId
      })
    },

    redo: () => {
      const stack = get().redoStack
      if (stack.length === 0) return
      const entry = stack[stack.length - 1]
      const currentWb = get().workbook

      const restored = applyRedo(currentWb, entry)
      const eng = get().engine
      eng.loadWorkbook(restored)

      set((s) => {
        s.undoStack.push(entry)
        s.redoStack.pop()
        s.workbook = restored
        s.activeSheetId = restored.activeSheetId
      })
    },
  }
}
