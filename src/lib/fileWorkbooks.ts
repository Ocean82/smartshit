import type { FileItem, WorkbookData } from '@/types'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { v4 as uuid } from 'uuid'
import type { PersistedState } from '@/lib/persistence'
import { capUndoStack, type HistoryEntry } from '@/lib/historyDiff'

/**
 * Pure helpers for the per-file workbook model. The store layer (useStore)
 * applies the results; these functions compute them so the behavior can be
 * unit-tested without booting the engine or the Zustand store.
 */

/** How long a trashed file stays recoverable. */
export const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SnapshotSource {
  workbook: WorkbookData
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string | null
  messages: PersistedState['messages']
}

/** Compose a full persisted snapshot, collapsing the live workbook into the active file's slot. */
export function buildPersistenceSnapshot(source: SnapshotSource): PersistedState {
  const activeFile = source.files.find((f) => f.id === source.activeFileId)
  const workbooks = { ...source.workbookSlots }
  if (activeFile?.workbookId) workbooks[activeFile.workbookId] = source.workbook
  return {
    workbooks,
    files: source.files,
    activeFileId: source.activeFileId,
    activeWorkbookId: activeFile?.workbookId ?? null,
    messages: source.messages,
  }
}

export interface InitialState {
  workbook: WorkbookData
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string
}

function isLiveFile(f: FileItem): boolean {
  return f.type === 'file' && f.deletedAt === undefined
}

function fileForWorkbook(wb: WorkbookData, name = wb.name): FileItem {
  return {
    id: uuid(),
    name,
    type: 'file',
    parentId: null,
    workbookId: wb.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Resolve the initial workspace from persisted state. Purges Trash entries
 * older than 30 days, seeds a starter file on first launch (or when every file
 * is in Trash), picks a valid active file, and loads its workbook (falling
 * back through the denormalized activeWorkbookId, any slot, then a fresh
 * workbook assigned the active file's id).
 */
export function resolveInitialState(persisted: PersistedState | null, now = Date.now()): InitialState {
  let workbookSlots: Record<string, WorkbookData> = { ...(persisted?.workbooks ?? {}) }

  let files: FileItem[]
  if (persisted?.files?.length) {
    const purged = purgeExpired(persisted.files, workbookSlots, now)
    files = purged.files
    workbookSlots = purged.workbookSlots
  } else {
    files = []
  }

  if (!files.some(isLiveFile)) {
    const starter = createEmptyWorkbook('My Budget')
    workbookSlots[starter.id] = starter
    files = [...files, fileForWorkbook(starter)]
  }

  const activeFileId = files.some((f) => f.id === persisted?.activeFileId && isLiveFile(f))
    ? (persisted!.activeFileId as string)
    : files.find(isLiveFile)!.id
  const activeFile = files.find((f) => f.id === activeFileId)

  const activeSlotId = activeFile?.workbookId ?? persisted?.activeWorkbookId ?? null
  let workbook = (activeSlotId && workbookSlots[activeSlotId]) || null
  if (!workbook && persisted?.activeWorkbookId && workbookSlots[persisted.activeWorkbookId]) {
    workbook = workbookSlots[persisted.activeWorkbookId]
  }
  if (!workbook) {
    const firstKey = Object.keys(workbookSlots)[0]
    if (firstKey) workbook = workbookSlots[firstKey]
  }
  if (!workbook) {
    workbook = createEmptyWorkbook(activeFile?.name ?? 'My Budget')
    workbook.id = activeFile?.workbookId ?? workbook.id
    workbookSlots[workbook.id] = workbook
  }

  return { workbook, workbookSlots, files, activeFileId }
}

export interface SwitchInput {
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string | null
  workbook: WorkbookData
  targetId: string
}

export interface SwitchResult {
  workbook: WorkbookData
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string
}

/**
 * Compute the target workbook to switch to: stash the live workbook into its
 * own slot (skipped when that file no longer exists), attach a workbookId
 * lazily to legacy files, and create the target's workbook lazily when it was
 * never opened. Returns null when the switch is a no-op (or the target is in Trash).
 */
export function switchFileState(input: SwitchInput): SwitchResult | null {
  const target = input.files.find((f) => f.id === input.targetId)
  if (!target || target.type !== 'file' || target.deletedAt !== undefined || input.targetId === input.activeFileId) {
    return null
  }

  const workbookSlots = { ...input.workbookSlots }
  const files = input.files.map((f) => ({ ...f }))

  let wbId = target.workbookId
  if (!wbId) {
    wbId = uuid()
    const f = files.find((x) => x.id === input.targetId)
    if (f) f.workbookId = wbId
  }

  const currentFile = files.find((f) => f.id === input.activeFileId)
  if (currentFile?.workbookId && currentFile.id !== input.targetId) {
    workbookSlots[currentFile.workbookId] = input.workbook
  }

  let workbook = workbookSlots[wbId]
  if (!workbook) {
    workbook = createEmptyWorkbook(target.name)
    workbook.id = wbId
    workbookSlots[wbId] = workbook
  }

  return { workbook, workbookSlots, files, activeFileId: input.targetId }
}

export interface AddFileInput {
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string | null
  /** The live workbook, stashed into the current file's slot. */
  workbook: WorkbookData
  /** The workbook to open as a new file. */
  newWorkbook: WorkbookData
  name: string
}

/**
 * Add `newWorkbook` as a new file and make it active. The current file is
 * saved untouched, so New Workbook and Import never overwrite anything.
 */
export function addFileState(input: AddFileInput): SwitchResult {
  const workbookSlots = { ...input.workbookSlots }
  const current = input.files.find((f) => f.id === input.activeFileId)
  if (current?.workbookId) workbookSlots[current.workbookId] = input.workbook

  // A restored backup or a copy can carry the id of a workbook that is already open
  // in another file; reusing it would overwrite that file's content.
  const taken = new Set<string>([input.workbook.id, ...Object.keys(workbookSlots), ...input.files.flatMap((f) => (f.workbookId ? [f.workbookId] : []))])
  const id = input.newWorkbook.id && !taken.has(input.newWorkbook.id) ? input.newWorkbook.id : uuid()
  const newWorkbook = { ...input.newWorkbook, id, name: input.name }
  workbookSlots[newWorkbook.id] = newWorkbook
  const file = fileForWorkbook(newWorkbook, input.name)
  return { workbook: newWorkbook, workbookSlots, files: [...input.files, file], activeFileId: file.id }
}

/** The name as given, or "name 2", "name 3"... when a live file already uses it (case-insensitive). */
export function uniqueFileName(files: FileItem[], base: string): string {
  const taken = new Set(files.filter(isLiveFile).map((f) => f.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

export type PostDeleteDecision =
  | { type: 'switch'; fileId: string }
  | { type: 'create-fallback'; name: string }

/** Decide where to land after the active file is trashed. Trashed files are never a landing spot. */
export function computePostDeleteSwitch(files: FileItem[]): PostDeleteDecision {
  const remaining = files.filter(isLiveFile)
  if (remaining.length) return { type: 'switch', fileId: remaining[0].id }
  return { type: 'create-fallback', name: 'My Workbook' }
}

// ─── Folders ────────────────────────────────────────────────────────────────

/** Folders `id` could be moved into: live folders other than itself and its own contents. */
export function moveTargets(files: FileItem[], id: string): FileItem[] {
  const item = files.find((f) => f.id === id)
  if (!item || item.deletedAt !== undefined) return []
  const blocked = item.type === 'folder' ? descendantIds(files, id) : new Set<string>()
  blocked.add(id)
  return files.filter((f) => f.type === 'folder' && f.deletedAt === undefined && !blocked.has(f.id))
}

/** True when moving `id` under `parentId` (null = top level) would change something and is allowed. */
export function canMoveFile(files: FileItem[], id: string, parentId: string | null): boolean {
  const item = files.find((f) => f.id === id)
  if (!item || item.deletedAt !== undefined || item.parentId === parentId) return false
  return parentId === null || moveTargets(files, id).some((f) => f.id === parentId)
}

/** Move a file or folder under `parentId` (null = top level). Returns the same array when the move is not allowed. */
export function moveFile(files: FileItem[], id: string, parentId: string | null): FileItem[] {
  if (!canMoveFile(files, id, parentId)) return files
  return files.map((f) => (f.id === id ? { ...f, parentId, updatedAt: Date.now() } : f))
}

// ─── Trash ──────────────────────────────────────────────────────────────────

function descendantIds(files: FileItem[], rootId: string): Set<string> {
  const out = new Set<string>()
  const queue = [rootId]
  while (queue.length) {
    const parent = queue.pop()!
    for (const f of files) {
      if (f.parentId === parent && !out.has(f.id)) {
        out.add(f.id)
        queue.push(f.id)
      }
    }
  }
  return out
}

export interface TrashResult {
  files: FileItem[]
  /** Every id that moved to Trash (the item plus, for a folder, its descendants). */
  trashedIds: string[]
}

/** Move an item to Trash. A folder takes its not-yet-trashed descendants with it. */
export function trashFiles(files: FileItem[], id: string, now: number): TrashResult {
  const target = files.find((f) => f.id === id)
  if (!target || target.deletedAt !== undefined) return { files, trashedIds: [] }
  const ids = new Set<string>([id])
  if (target.type === 'folder') {
    for (const childId of descendantIds(files, id)) {
      if (files.find((f) => f.id === childId)?.deletedAt === undefined) ids.add(childId)
    }
  }
  return {
    files: files.map((f) => {
      if (!ids.has(f.id)) return f
      return f.id === id ? { ...f, deletedAt: now } : { ...f, deletedAt: now, trashedWith: id }
    }),
    trashedIds: [...ids],
  }
}

/**
 * Restore a trashed item, and for a folder everything it took with it. An item
 * whose parent folder is gone or still in Trash returns to the root.
 */
export function restoreFiles(files: FileItem[], id: string): FileItem[] {
  const target = files.find((f) => f.id === id)
  if (!target || target.deletedAt === undefined) return files
  const parent = target.parentId ? files.find((f) => f.id === target.parentId) : undefined
  const parentUsable = parent !== undefined && parent.deletedAt === undefined
  return files.map((f) => {
    const restoring = f.id === id || f.trashedWith === id
    if (!restoring) return f
    const { deletedAt: _d, trashedWith: _t, ...rest } = f
    return f.id === id && target.parentId && !parentUsable ? { ...rest, parentId: null } : rest
  })
}

export interface RemoveResult {
  files: FileItem[]
  workbookSlots: Record<string, WorkbookData>
  removedIds: string[]
}

/** Permanently remove files and their workbook slots. Orphaned children return to the root. */
export function removeFiles(
  files: FileItem[],
  workbookSlots: Record<string, WorkbookData>,
  ids: Set<string>,
): RemoveResult {
  if (ids.size === 0) return { files, workbookSlots, removedIds: [] }
  const slots = { ...workbookSlots }
  for (const f of files) {
    if (ids.has(f.id) && f.workbookId) delete slots[f.workbookId]
  }
  const kept = files
    .filter((f) => !ids.has(f.id))
    .map((f) => (f.parentId && ids.has(f.parentId) ? { ...f, parentId: null } : f))
  return { files: kept, workbookSlots: slots, removedIds: [...ids] }
}

/** Permanently delete one trashed item (and what it took with it). */
export function deleteForever(
  files: FileItem[],
  workbookSlots: Record<string, WorkbookData>,
  id: string,
): RemoveResult {
  const target = files.find((f) => f.id === id)
  if (!target || target.deletedAt === undefined) return { files, workbookSlots, removedIds: [] }
  const ids = new Set([id, ...files.filter((f) => f.trashedWith === id).map((f) => f.id)])
  return removeFiles(files, workbookSlots, ids)
}

export function emptyTrash(files: FileItem[], workbookSlots: Record<string, WorkbookData>): RemoveResult {
  return removeFiles(files, workbookSlots, new Set(files.filter((f) => f.deletedAt !== undefined).map((f) => f.id)))
}

/** Drop trashed items older than the retention window. */
export function purgeExpired(
  files: FileItem[],
  workbookSlots: Record<string, WorkbookData>,
  now: number,
  ttlMs = TRASH_TTL_MS,
): RemoveResult {
  const expired = new Set(
    files.filter((f) => f.deletedAt !== undefined && now - f.deletedAt >= ttlMs).map((f) => f.id),
  )
  return removeFiles(files, workbookSlots, expired)
}

// ─── Per-file undo history ──────────────────────────────────────────────────

export interface UndoSlot {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
}

/** Inactive files that keep their undo history. Oldest is dropped first. */
export const MAX_UNDO_SLOTS = 3
/** Stricter than the live stack: a parked file should not hold much memory. */
const PARKED_UNDO = { maxEntries: 100, maxBytes: 8 * 1024 * 1024, minEntries: 10 }

/** Park a file's undo/redo history. Empty history is not stored. */
export function stashUndoSlot(
  slots: Record<string, UndoSlot>,
  fileId: string,
  slot: UndoSlot,
  maxSlots = MAX_UNDO_SLOTS,
): Record<string, UndoSlot> {
  const next = { ...slots }
  delete next[fileId]
  if (slot.undoStack.length || slot.redoStack.length) {
    next[fileId] = {
      undoStack: capUndoStack([...slot.undoStack], PARKED_UNDO),
      redoStack: capUndoStack([...slot.redoStack], PARKED_UNDO),
    }
  }
  const keys = Object.keys(next)
  while (keys.length > maxSlots) delete next[keys.shift()!]
  return next
}

/** Remove a file's parked history (used when the file is deleted for good). */
export function dropUndoSlots(slots: Record<string, UndoSlot>, fileIds: string[]): Record<string, UndoSlot> {
  if (!fileIds.some((id) => id in slots)) return slots
  const next = { ...slots }
  for (const id of fileIds) delete next[id]
  return next
}
