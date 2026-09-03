import type { WorkbookData, FileItem, ChatMessage } from '@/types'

const STORAGE_KEY = 'smartsht-state-v1'
/** Where a corrupt payload is copied before we discard it, for recovery. */
const CORRUPT_BACKUP_KEY = 'smartsht-state-v1.corrupt'

/**
 * Outcome of a local save so callers can surface it (persistence.ts stays UI-free).
 * Named LocalSaveResult to avoid colliding with cloudSync's SaveResult, which is
 * re-exported alongside this from src/lib/index.ts.
 */
export type LocalSaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'error'; error?: unknown }

/** Best-effort check for a storage quota error across browsers. */
function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    // Standard name, plus the legacy Firefox name and code.
    return err.name === 'QuotaExceededError'
      || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || err.code === 22
  }
  return false
}

export interface PersistedState {
  /** All workbooks keyed by their workbookId (including the active one's latest save). */
  workbooks: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string | null
  /** The workbookId behind `activeFileId` (denormalized for recovery). */
  activeWorkbookId: string | null
  messages: ChatMessage[]
}

interface LegacyPersistedState {
  workbook?: WorkbookData
  files?: FileItem[]
  activeFileId?: string | null
  messages?: ChatMessage[]
}

export function loadPersistedState(): PersistedState | null {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState & LegacyPersistedState

    // Files are the source of truth for which workbooks exist.
    if (!parsed.files?.length) return null

    let workbooks: Record<string, WorkbookData> =
      parsed.workbooks && typeof parsed.workbooks === 'object' ? parsed.workbooks : {}

    // Migrate the legacy single-workbook shape (pre multi-file persistence).
    if (Object.keys(workbooks).length === 0 && parsed.workbook?.sheets?.length) {
      workbooks = { [parsed.workbook.id]: parsed.workbook }
    }

    return {
      workbooks,
      files: parsed.files,
      activeFileId: parsed.files.some((f) => f.id === parsed.activeFileId)
        ? parsed.activeFileId
        : parsed.files[0].id,
      activeWorkbookId: parsed.activeWorkbookId ?? null,
      messages: parsed.messages ?? [],
    }
  } catch {
    // A parse/shape error would otherwise silently discard every workbook and
    // chat message. Quarantine the raw payload under a backup key first so it's
    // recoverable (support export, manual salvage) instead of lost outright.
    quarantineCorruptState()
    return null
  }
}

/** Copy the current (unparseable) payload to a backup key before it's discarded. */
function quarantineCorruptState(): void {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null
    if (!storage) return
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return
    // Preserve the most recent corrupt payload plus when it was quarantined.
    storage.setItem(CORRUPT_BACKUP_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }))
  } catch {
    // Backup is best-effort; never let it throw into the load path.
  }
}

/**
 * Persist the snapshot to localStorage. Returns a result so the caller can
 * surface quota/failure to the user — a silent no-op here means the user
 * believes their work is saved locally when it is not.
 */
export function savePersistedState(state: PersistedState): LocalSaveResult {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null
  if (!storage) return { ok: false, reason: 'error' }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: isQuotaError(err) ? 'quota' : 'error', error: err }
  }
}