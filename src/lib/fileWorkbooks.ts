import type { FileItem, WorkbookData } from '@/types'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { v4 as uuid } from 'uuid'
import type { PersistedState } from '@/lib/persistence'

/**
 * Pure helpers for the per-file workbook model. The store layer (useStore)
 * applies the results; these functions compute them so the behavior can be
 * unit-tested without booting the engine or the Zustand store.
 */

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

/**
 * Resolve the initial workspace from persisted state. Seeds a starter file
 * on first launch, picks a valid active file, and loads its workbook (falling
 * back through the denormalized activeWorkbookId, any slot, then a fresh
 * workbook assigned the active file's id).
 */
export function resolveInitialState(persisted: PersistedState | null): InitialState {
  const workbookSlots: Record<string, WorkbookData> = { ...(persisted?.workbooks ?? {}) }

  let files: FileItem[]
  if (persisted?.files?.length) {
    files = persisted.files
  } else {
    const starter = createEmptyWorkbook('My Budget')
    workbookSlots[starter.id] = starter
    files = [
      {
        id: uuid(),
        name: starter.name,
        type: 'file',
        parentId: null,
        workbookId: starter.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]
  }

  const activeFileId = files.some((f) => f.id === persisted?.activeFileId)
    ? (persisted!.activeFileId as string)
    : (files.find((f) => f.type === 'file')?.id ?? files[0].id)
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
 * never opened. Returns null when the switch is a no-op.
 */
export function switchFileState(input: SwitchInput): SwitchResult | null {
  const target = input.files.find((f) => f.id === input.targetId)
  if (!target || target.type !== 'file' || input.targetId === input.activeFileId) return null

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

export type PostDeleteDecision =
  | { type: 'switch'; fileId: string }
  | { type: 'create-fallback'; name: string }

/** Decide where to land after the active file is deleted. */
export function computePostDeleteSwitch(files: FileItem[]): PostDeleteDecision {
  const remaining = files.filter((f) => f.type === 'file')
  if (remaining.length) return { type: 'switch', fileId: remaining[0].id }
  return { type: 'create-fallback', name: 'My Workbook' }
}

export interface RebindInput {
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
  activeFileId: string | null
  workbook: WorkbookData
}

export interface RebindResult {
  workbookSlots: Record<string, WorkbookData>
  files: FileItem[]
}

/**
 * After New Workbook replaces the live content with a fresh id, drop the
 * active file's old slot and rebind the file to the new workbook.
 */
export function rebindActiveFile(input: RebindInput): RebindResult {
  const workbookSlots = { ...input.workbookSlots }
  const files = input.files.map((f) => ({ ...f }))
  const current = files.find((f) => f.id === input.activeFileId)
  if (!current) return { workbookSlots, files }
  if (current.workbookId) delete workbookSlots[current.workbookId]
  current.workbookId = input.workbook.id
  workbookSlots[input.workbook.id] = input.workbook
  return { workbookSlots, files }
}