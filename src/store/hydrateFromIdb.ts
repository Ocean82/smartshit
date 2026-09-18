/**
 * Boot-time reconciliation between the synchronous localStorage seed and the
 * durable IndexedDB primary.
 *
 * The store is seeded synchronously from localStorage at creation (IDB is async
 * and can't block init). But localStorage caps at ~5MB, so on a large workbook
 * the last session's localStorage mirror may be stale or truncated while IDB
 * holds the complete, newer snapshot. This runs once after mount and swaps in
 * the IDB snapshot when it is strictly newer — and only if the user hasn't
 * already touched the workbook, so we never clobber fresh edits or flash.
 */

import { useStore } from '@/store/useStore'
import { loadPersistedStateAsync } from '@/lib/persistence'
import { resolveInitialState } from '@/lib/fileWorkbooks'

export async function hydrateFromIdbIfNewer(): Promise<void> {
  // Capture the seed's write time and the live workbook reference up front. If
  // the reference changes before hydration resolves, the user edited (or a file
  // switch happened) — abort rather than overwrite their work.
  const seededWorkbook = useStore.getState().workbook
  const seedSavedAt = readSeedSavedAt()

  const loaded = await loadPersistedStateAsync()
  if (!loaded || loaded.source !== 'idb') return

  // Only adopt IDB when it is strictly newer than the localStorage seed.
  if (loaded.savedAt <= seedSavedAt) return

  // Bail if anything changed since boot (edit, file switch, cloud load).
  if (useStore.getState().workbook !== seededWorkbook) return

  const seeded = resolveInitialState(loaded)
  const state = useStore.getState()
  state.engine.loadWorkbook(seeded.workbook)
  useStore.setState((s) => {
    s.workbook = seeded.workbook
    s.activeSheetId = seeded.workbook.activeSheetId
    s.workbookSlots = seeded.workbookSlots
    s.files = seeded.files
    s.activeFileId = seeded.activeFileId
    if (loaded.messages.length) s.messages = loaded.messages
    // A fresh hydrate is a clean baseline — prior undo history referred to the
    // stale seed and no longer applies.
    s.undoStack = []
    s.redoStack = []
  })
}

/** The localStorage seed's savedAt (0 when absent/unknown). */
function readSeedSavedAt(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('smartsht-state-v1') : null
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { savedAt?: number }
    return typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
  } catch {
    return 0
  }
}
