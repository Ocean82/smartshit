/**
 * File Slice — file explorer state and file management actions.
 *
 * Manages the virtual file system for organizing workbooks.
 */

import type { FileItem } from '@/types'
import { createEmptyWorkbook } from '@/engine/spreadsheet'
import { v4 as uuid } from 'uuid'

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
}

/**
 * Create file actions. Takes the immer `set` function from Zustand.
 * Behavior matches the previous inline store implementations (workbookId on create;
 * delete is filter-only without cascading children).
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
      set((s) => { s.files = s.files.filter((f) => f.id !== id) })
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
  }
}
