import type { WorkbookData, FileItem, ChatMessage } from '@/types'

const STORAGE_KEY = 'smartsht-state-v1'

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
    return null
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null
    storage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — ignore
  }
}