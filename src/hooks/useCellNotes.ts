/**
 * React hook for cell notes — provides reactive access to the CellNotesService.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { getCellNotesService, type CellNote, type NoteMap } from '@/lib/cellNotes'
import { useStore } from '@/store/useStore'

export function useCellNotes() {
  const service = getCellNotesService()
  const activeSheetId = useStore((s) => s.activeSheetId)

  const subscribe = useCallback((cb: () => void) => service.subscribe(cb), [service])
  const getSnapshot = useCallback(() => service.noteCount(activeSheetId), [service, activeSheetId])

  // Force re-render on changes
  useSyncExternalStore(subscribe, getSnapshot)

  return {
    /** All notes for the active sheet. */
    notes: service.getNotesForSheet(activeSheetId),
    /** Get a note for a specific cell. */
    getNote: (cellId: string) => service.getNote(activeSheetId, cellId),
    /** Check if a cell has a note. */
    hasNote: (cellId: string) => service.hasNote(activeSheetId, cellId),
    /** Add or update a note. */
    setNote: (cellId: string, text: string, author?: string) => service.setNote(activeSheetId, cellId, text, author),
    /** Remove a note. */
    removeNote: (cellId: string) => service.removeNote(activeSheetId, cellId),
    /** Toggle note visibility. */
    toggleVisibility: (cellId: string) => service.toggleVisibility(activeSheetId, cellId),
    /** All cell IDs with notes. */
    notedCellIds: service.getNotedCellIds(activeSheetId),
    /** Total note count. */
    noteCount: service.noteCount(activeSheetId),
  }
}
