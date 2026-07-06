import type { WorkbookData, FileItem, ChatMessage } from '@/types'

const STORAGE_KEY = 'smartshit-state-v1'

export interface PersistedState {
  workbook: WorkbookData
  files: FileItem[]
  activeFileId: string | null
  messages: ChatMessage[]
}

export function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed.workbook?.sheets?.length) return null
    return parsed
  } catch {
    return null
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable — ignore
  }
}
