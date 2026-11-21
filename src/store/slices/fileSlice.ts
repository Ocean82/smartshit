/**
 * File Slice — file explorer state and file management actions.
 *
 * Manages the virtual file system for organizing workbooks.
 */

import type { FileItem } from '@/types'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { v4 as uuid } from 'uuid'
import { trashFiles, moveFile } from '@/lib/fileWorkbooks'

export interface FileState {
  files: FileItem[]
  activeFileId: string | null
}

export interface FileActions {
  createFile: (name: string, parentId?: string | null) => void
  createFolder: (name: string, parentId?: string | null) => void
  deleteFile: (id: string) => void
  renameFile: (id: string, name: string) => void
  openFile: (id: string) => void
  /** Move a file or folder into a folder (null = top level). Ignored when not allowed. */
  moveFile: (id: string, parentId: string | null) => void
  /** Set (or clear, with null) the cloud workbook binding on the active file. */
  setActiveFileCloudId: (cloudId: string | null) => void
}

/**
 * Create file actions. Takes the immer `set` function from Zustand.
 * deleteFile here only marks items as trashed (a folder takes its contents along).
 * The composed store (useStore) overrides openFile, deleteFile and renameFile
 * to also switch workbooks, keep the workbook for Restore, and keep names in step.
 */
export function createFileActions(
  set: (fn: (s: FileState) => void) => void,
): FileActions {
  return {
    createFile: (name, parentId = null) => {
      const wb = createEmptyWorkbook(name)
      const file: FileItem = {
        id: uuid(),
        name,
        type: 'file',
        parentId: parentId ?? null,
        workbookId: wb.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => { s.files.push(file) })
    },

    createFolder: (name, parentId = null) => {
      const folder: FileItem = {
        id: uuid(),
        name,
        type: 'folder',
        parentId: parentId ?? null,
        children: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => { s.files.push(folder) })
    },

    deleteFile: (id) => {
      set((s) => { s.files = trashFiles(s.files, id, Date.now()).files })
    },

    renameFile: (id, name) => {
      set((s) => {
        const file = s.files.find((f) => f.id === id)
        if (file) file.name = name
      })
    },

    openFile: (id) => {
      set((s) => { s.activeFileId = id })
    },

    moveFile: (id, parentId) => {
      set((s) => { s.files = moveFile(s.files, id, parentId) })
    },

    setActiveFileCloudId: (cloudId) => {
      set((s) => {
        const file = s.files.find((f) => f.id === s.activeFileId)
        if (!file) return
        if (cloudId) file.cloudWorkbookId = cloudId
        else delete file.cloudWorkbookId
      })
    },
  }
}
