/**
 * File Slice — file explorer state and file management actions.
 *
 * Manages the virtual file system for organizing workbooks.
 */

import type { FileItem } from '@/types'
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
 */
export function createFileActions(
  set: (fn: (s: FileState) => void) => void,
): FileActions {
  return {
    createFile: (name, parentId = null) => {
      const newFile: FileItem = {
        id: uuid(),
        name,
        type: 'file',
        parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => { s.files.push(newFile) })
    },

    createFolder: (name, parentId = null) => {
      const newFolder: FileItem = {
        id: uuid(),
        name,
        type: 'folder',
        parentId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => { s.files.push(newFolder) })
    },

    deleteFile: (id) => {
      set((s) => {
        s.files = s.files.filter((f) => f.id !== id && f.parentId !== id)
        if (s.activeFileId === id) {
          s.activeFileId = s.files[0]?.id ?? null
        }
      })
    },

    renameFile: (id, name) => {
      set((s) => {
        const file = s.files.find((f) => f.id === id)
        if (file) {
          file.name = name
          file.updatedAt = Date.now()
        }
      })
    },

    openFile: (id) => {
      set((s) => { s.activeFileId = id })
    },
  }
}
