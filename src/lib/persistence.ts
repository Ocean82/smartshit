import type { WorkbookData, FileItem, ChatMessage } from '@/types'
import { idbGet, idbSet } from '@/lib/idbStorage'

const STORAGE_KEY = 'smartsht-state-v1'
/** Where a corrupt payload is copied before we discard it, for recovery. */
const CORRUPT_BACKUP_KEY = 'smartsht-state-v1.corrupt'
/** IndexedDB key holding the durable, size-uncapped primary snapshot. */
const IDB_STATE_KEY = 'state-v1'

/** IDB envelope: the snapshot plus when it was written, for staleness checks. */
interface PersistedEnvelope {
  savedAt: number
  state: PersistedState
}

/** A loaded snapshot annotated with its source and write time (for hydration). */
export interface LoadedPersistedState extends PersistedState {
  /** epoch ms when this snapshot was written, or 0 if unknown (legacy). */
  savedAt: number
  /** Which durable layer this came from. */
  source: 'idb' | 'localStorage'
}

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

/**
 * Normalize a parsed payload (current or legacy shape) into PersistedState,
 * or null when it carries no usable workspace. Pure — no storage access.
 */
function normalizePersisted(
  parsed: (PersistedState & LegacyPersistedState) | null | undefined,
): PersistedState | null {
  // Files are the source of truth for which workbooks exist.
  if (!parsed?.files?.length) return null

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
}

/**
 * Synchronous load from localStorage. Used to seed the store at creation time
 * (IndexedDB is async and cannot block store init). IDB may hold a newer/larger
 * snapshot; boot hydration reconciles that after mount via loadPersistedStateAsync.
 */
export function loadPersistedState(): PersistedState | null {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizePersisted(JSON.parse(raw) as PersistedState & LegacyPersistedState)
  } catch {
    // A parse/shape error would otherwise silently discard every workbook and
    // chat message. Quarantine the raw payload under a backup key first so it's
    // recoverable (support export, manual salvage) instead of lost outright.
    quarantineCorruptState()
    return null
  }
}

/**
 * Async load preferring the IndexedDB primary, falling back to localStorage.
 * Returns the snapshot annotated with savedAt + source so callers can decide
 * whether IDB is newer than the sync localStorage seed. Never throws.
 */
export async function loadPersistedStateAsync(): Promise<LoadedPersistedState | null> {
  // IndexedDB first — it's the durable, size-uncapped primary.
  try {
    const env = await idbGet<PersistedEnvelope>(IDB_STATE_KEY)
    const state = normalizePersisted(env?.state as (PersistedState & LegacyPersistedState) | undefined)
    if (state) {
      return { ...state, savedAt: env?.savedAt ?? 0, source: 'idb' }
    }
  } catch {
    // Fall through to localStorage.
  }

  // Fallback: localStorage (also covers migration from pre-IDB installs).
  const local = loadPersistedState()
  if (local) {
    const savedAt = readLocalSavedAt()
    return { ...local, savedAt, source: 'localStorage' }
  }
  return null
}

/** Read the localStorage mirror's write time, if present (0 when unknown). */
function readLocalSavedAt(): number {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw) as { savedAt?: number }
    return typeof parsed.savedAt === 'number' ? parsed.savedAt : 0
  } catch {
    return 0
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
 * Persist the snapshot to localStorage synchronously. Retained for callers that
 * need a blocking write (and as the mirror written by savePersistedStateAsync).
 * Returns a result so the caller can surface quota/failure — a silent no-op here
 * means the user believes their work is saved locally when it is not.
 *
 * A `savedAt` timestamp is stored alongside the state so boot hydration can tell
 * whether the IndexedDB primary holds a newer snapshot. normalizePersisted
 * ignores the extra field.
 */
export function savePersistedState(state: PersistedState, savedAt = Date.now()): LocalSaveResult {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null
  if (!storage) return { ok: false, reason: 'error' }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt }))
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: isQuotaError(err) ? 'quota' : 'error', error: err }
  }
}

/**
 * Durable async save: write the IndexedDB primary (no ~5MB cap, off the main
 * thread), then mirror to localStorage so the next boot can seed synchronously.
 *
 * Success is defined as "at least one durable layer accepted the write" — IDB
 * is authoritative, so a localStorage quota failure is NOT fatal when IDB
 * succeeded (this is the whole point of the migration: large workbooks that
 * overflow localStorage still persist). Only when BOTH fail do we report the
 * failure so the caller can warn the user.
 */
export async function savePersistedStateAsync(state: PersistedState): Promise<LocalSaveResult> {
  const savedAt = Date.now()

  const idbOk = await idbSet<PersistedEnvelope>(IDB_STATE_KEY, { savedAt, state })

  // Mirror to localStorage for the synchronous boot seed. Best-effort: on a
  // large workbook this may hit quota, which is fine once IDB has the truth.
  const localResult = savePersistedState(state, savedAt)

  if (idbOk || localResult.ok) return { ok: true }
  // Neither layer accepted the write — propagate localStorage's reason.
  return localResult
}