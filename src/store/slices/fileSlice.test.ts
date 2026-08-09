import { describe, it, expect } from 'vitest'
import { createFileActions } from './fileSlice'

describe('fileSlice', () => {
  it('createFile stores workbookId from an empty workbook', () => {
    const files: ReturnType<typeof createFileActions> extends never ? never : import('@/types').FileItem[] = []
    let activeFileId: string | null = null
    const actions = createFileActions((fn) => {
      const state = { files, activeFileId }
      fn(state)
      files.splice(0, files.length, ...state.files)
      activeFileId = state.activeFileId
    })

    actions.createFile('Budget.xlsx')

    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('Budget.xlsx')
    expect(files[0].type).toBe('file')
    expect(files[0].workbookId).toBeTruthy()
  })

  it('deleteFile removes only the matching id', () => {
    const files = [
      { id: 'a', name: 'A', type: 'file' as const, parentId: null, createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'B', type: 'folder' as const, parentId: null, children: [], createdAt: 1, updatedAt: 1 },
      { id: 'c', name: 'C', type: 'file' as const, parentId: 'b', createdAt: 1, updatedAt: 1 },
    ]
    let activeFileId: string | null = 'a'
    const actions = createFileActions((fn) => {
      const state = { files, activeFileId }
      fn(state)
      files.splice(0, files.length, ...state.files)
      activeFileId = state.activeFileId
    })

    actions.deleteFile('b')

    expect(files.map((f) => f.id)).toEqual(['a', 'c'])
    expect(activeFileId).toBe('a')
  })
})
