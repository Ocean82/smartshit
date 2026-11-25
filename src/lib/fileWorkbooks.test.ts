import { describe, it, expect } from 'vitest'
import {
  resolveInitialState,
  switchFileState,
  computePostDeleteSwitch,
  addFileState,
  trashFiles,
  restoreFiles,
  removeFiles,
  deleteForever,
  emptyTrash,
  purgeExpired,
  stashUndoSlot,
  uniqueFileName,
  moveFile,
  moveTargets,
  canMoveFile,
  dropUndoSlots,
  buildPersistenceSnapshot,
  type UndoSlot,
} from './fileWorkbooks'
import type { HistoryEntry } from '@/lib/historyDiff'
import type { FileItem, WorkbookData, ChatMessage } from '@/types'
import type { PersistedState } from '@/lib/persistence'

function makeWorkbook(id: string, name: string): WorkbookData {
  return {
    id,
    name,
    sheets: [
      {
        id: `s-${id}`,
        name: 'Sheet1',
        cells: { A1: { value: `data-${id}` } },
        columnWidths: {},
        rowHeights: {},
      },
    ],
    activeSheetId: `s-${id}`,
    createdAt: 1,
    updatedAt: 1,
  }
}

function makeFile(id: string, workbookId?: string): FileItem {
  return {
    id,
    name: id,
    type: 'file',
    parentId: null,
    workbookId,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('resolveInitialState', () => {
  it('seeds a starter file and workbook on first launch', () => {
    const initial = resolveInitialState(null)
    expect(initial.files).toHaveLength(1)
    expect(initial.files[0].workbookId).toBe(initial.workbook.id)
    expect(initial.workbookSlots[initial.workbook.id]).toBe(initial.workbook)
    expect(initial.activeFileId).toBe(initial.files[0].id)
  })

  it('loads the active file’s workbook by its slot', () => {
    const persisted: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A'), wb2: makeWorkbook('wb2', 'B') },
      files: [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')],
      activeFileId: 'f2',
      activeWorkbookId: 'wb2',
      messages: [],
    }
    const initial = resolveInitialState(persisted)
    expect(initial.activeFileId).toBe('f2')
    expect(initial.workbook.id).toBe('wb2')
  })

  it('falls back to a valid file when activeFileId is stale', () => {
    const persisted: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A') },
      files: [makeFile('f1', 'wb1')],
      activeFileId: 'deleted',
      activeWorkbookId: 'wb1',
      messages: [],
    }
    const initial = resolveInitialState(persisted)
    expect(initial.activeFileId).toBe('f1')
  })

  it('creates a fresh workbook when no slot exists at all', () => {
    const persisted: PersistedState = {
      workbooks: {},
      files: [makeFile('f1', 'missing-slot')],
      activeFileId: 'f1',
      activeWorkbookId: null,
      messages: [],
    }
    const initial = resolveInitialState(persisted)
    expect(initial.workbook.id).toBe('missing-slot')
    expect(initial.workbookSlots['missing-slot']).toBe(initial.workbook)
  })

  it('falls back to the first available slot for a missing active slot', () => {
    const persisted: PersistedState = {
      workbooks: { wb1: makeWorkbook('wb1', 'A') },
      files: [makeFile('f1', 'missing-slot')],
      activeFileId: 'f1',
      activeWorkbookId: null,
      messages: [],
    }
    const initial = resolveInitialState(persisted)
    expect(initial.workbook.id).toBe('wb1')
  })
})

describe('switchFileState', () => {
  it('stashes the live workbook and loads the target', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A') }
    const files = [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')]
    const live = { ...slots.wb1, name: 'A-edited' }

    const next = switchFileState({ workbookSlots: slots, files, activeFileId: 'f1', workbook: live, targetId: 'f2' })

    expect(next).not.toBeNull()
    expect(next!.activeFileId).toBe('f2')
    expect(next!.workbook.id).toBe('wb2')
    // live workbook parked under f1's slot with edits preserved
    expect(next!.workbookSlots.wb1.name).toBe('A-edited')
  })

  it('creates the target workbook lazily when it was never opened', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A') }
    const files = [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')]

    const next = switchFileState({ workbookSlots: slots, files, activeFileId: 'f1', workbook: slots.wb1, targetId: 'f2' })

    expect(next!.workbook.id).toBe('wb2')
    expect(next!.workbook.name).toBe('f2')
    expect(next!.workbookSlots.wb2).toBe(next!.workbook)
  })

  it('attaches a workbookId to legacy files lacking one', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A') }
    const files = [makeFile('f1', 'wb1'), makeFile('f2')]

    const next = switchFileState({ workbookSlots: slots, files, activeFileId: 'f1', workbook: slots.wb1, targetId: 'f2' })

    expect(next!.files.find((f) => f.id === 'f2')!.workbookId).toBeDefined()
    expect(next!.workbook.id).toBe(next!.files.find((f) => f.id === 'f2')!.workbookId)
  })

  it('does not stash the live workbook when its file was deleted', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A'), wb2: makeWorkbook('wb2', 'B') }
    const files = [makeFile('f2', 'wb2')]

    const next = switchFileState({ workbookSlots: slots, files, activeFileId: 'deleted', workbook: slots.wb1, targetId: 'f2' })

    expect(next!.workbook.id).toBe('wb2')
    // wb1 (deleted file's workbook) untouched, no orphan write of the live doc
    expect(next!.workbookSlots.wb1).toBe(slots.wb1)
  })

  it('returns null for unknown targets and self-switches', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A') }
    const files = [makeFile('f1', 'wb1')]
    expect(
      switchFileState({ workbookSlots: slots, files, activeFileId: 'f1', workbook: slots.wb1, targetId: 'nope' }),
    ).toBeNull()
    expect(
      switchFileState({ workbookSlots: slots, files, activeFileId: 'f1', workbook: slots.wb1, targetId: 'f1' }),
    ).toBeNull()
  })
})

describe('computePostDeleteSwitch', () => {
  it('switches to the first remaining file', () => {
    expect(computePostDeleteSwitch([makeFile('b', 'wb'), makeFile('a', 'wb')])).toEqual({
      type: 'switch',
      fileId: 'b',
    })
  })

  it('skips folders when choosing the next file', () => {
    const folder: FileItem = { ...makeFile('folder', 'wb'), type: 'folder', children: [] }
    expect(computePostDeleteSwitch([makeFile('only-file', 'wb'), folder])).toEqual({
      type: 'switch',
      fileId: 'only-file',
    })
  })

  it('requests a fallback workbook when nothing remains', () => {
    expect(computePostDeleteSwitch([])).toEqual({ type: 'create-fallback', name: 'My Workbook' })
  })
})

describe('addFileState', () => {
  it('adds a new file, saves the current workbook untouched, and activates the new one', () => {
    const live = makeWorkbook('old', 'Old')
    const slots = { other: makeWorkbook('other', 'Other') }
    const files = [makeFile('f1', 'old'), makeFile('f2', 'other')]
    const imported = makeWorkbook('new', 'sheet.xlsx')
    const next = addFileState({ workbookSlots: slots, files, activeFileId: 'f1', workbook: live, newWorkbook: imported, name: 'Budget 2026' })
    expect(next.workbookSlots.old).toBe(live)
    expect(next.workbookSlots.other).toBe(slots.other)
    expect(next.files).toHaveLength(3)
    const added = next.files[2]
    expect(added).toMatchObject({ name: 'Budget 2026', type: 'file', parentId: null, workbookId: 'new' })
    expect(next.activeFileId).toBe(added.id)
    expect(next.workbook.id).toBe('new')
    expect(next.workbook.name).toBe('Budget 2026')
    expect(next.workbookSlots.new).toBe(next.workbook)
  })
})

describe('uniqueFileName', () => {
  it('keeps a free name and numbers a taken one, ignoring trashed files', () => {
    const files: FileItem[] = [{ ...makeFile('a'), name: 'Budget' }, { ...makeFile('b'), name: 'budget 2' }, { ...makeFile('c'), name: 'Plan', deletedAt: 1 }]
    expect(uniqueFileName(files, 'Plan')).toBe('Plan')
    expect(uniqueFileName(files, 'Budget')).toBe('Budget 3')
    expect(uniqueFileName([], 'New Workbook')).toBe('New Workbook')
  })
})

describe('moving files between folders', () => {
  const folder = (id: string, parentId: string | null = null): FileItem => ({ ...makeFile(id), type: 'folder', children: [], parentId })
  const file = (id: string, parentId: string | null = null): FileItem => ({ ...makeFile(id, `wb-${id}`), parentId })

  it('moves a file into a folder and back to the top level', () => {
    const files = [folder('dir'), file('a')]
    const inside = moveFile(files, 'a', 'dir')
    expect(inside.find((f) => f.id === 'a')!.parentId).toBe('dir')
    expect(moveFile(inside, 'a', null).find((f) => f.id === 'a')!.parentId).toBeNull()
  })

  it('refuses a folder into itself or into its own contents', () => {
    const files = [folder('outer'), folder('inner', 'outer'), file('a', 'inner')]
    expect(moveFile(files, 'outer', 'outer')).toBe(files)
    expect(moveFile(files, 'outer', 'inner')).toBe(files)
    expect(moveTargets(files, 'outer').map((f) => f.id)).toEqual([])
    expect(moveTargets(files, 'inner').map((f) => f.id)).toEqual(['outer'])
  })

  it('refuses no-op moves, files as targets, unknown ids and trashed folders', () => {
    const files = [folder('dir'), { ...folder('gone'), deletedAt: 1 }, file('a'), file('b', 'dir')]
    expect(moveFile(files, 'b', 'dir')).toBe(files)
    expect(moveFile(files, 'a', 'b')).toBe(files)
    expect(moveFile(files, 'nope', 'dir')).toBe(files)
    expect(moveFile(files, 'a', 'gone')).toBe(files)
    expect(canMoveFile(files, 'a', 'dir')).toBe(true)
    expect(moveTargets(files, 'a').map((f) => f.id)).toEqual(['dir'])
  })
})

describe('trash', () => {
  const folder: FileItem = { ...makeFile('dir'), type: 'folder', children: [] }
  const inDir = (id: string): FileItem => ({ ...makeFile(id, `wb-${id}`), parentId: 'dir' })

  it('trashFiles marks a file and leaves the rest alone', () => {
    const files = [makeFile('a', 'wa'), makeFile('b', 'wb')]
    const r = trashFiles(files, 'a', 100)
    expect(r.trashedIds).toEqual(['a'])
    expect(r.files.find((f) => f.id === 'a')).toMatchObject({ deletedAt: 100 })
    expect(r.files.find((f) => f.id === 'b')!.deletedAt).toBeUndefined()
  })

  it('trashing a folder takes nested files with it, and restoring the folder brings them back', () => {
    const files = [folder, inDir('x'), inDir('y'), makeFile('z', 'wz')]
    const trashed = trashFiles(files, 'dir', 100)
    expect(trashed.trashedIds.sort()).toEqual(['dir', 'x', 'y'])
    expect(trashed.files.find((f) => f.id === 'x')).toMatchObject({ deletedAt: 100, trashedWith: 'dir' })
    expect(trashed.files.find((f) => f.id === 'z')!.deletedAt).toBeUndefined()
    const restored = restoreFiles(trashed.files, 'dir')
    expect(restored.every((f) => f.deletedAt === undefined && f.trashedWith === undefined)).toBe(true)
    expect(restored.find((f) => f.id === 'x')!.parentId).toBe('dir')
  })

  it('restoring a file whose folder is still in Trash returns it to the root', () => {
    const trashed = trashFiles([folder, inDir('x')], 'dir', 100).files
    const restored = restoreFiles(trashed, 'x')
    const x = restored.find((f) => f.id === 'x')!
    expect(x.deletedAt).toBeUndefined()
    expect(x.parentId).toBeNull()
    expect(restored.find((f) => f.id === 'dir')!.deletedAt).toBe(100)
  })

  it('trashing is idempotent and ignores unknown ids', () => {
    const files = [makeFile('a', 'wa')]
    const once = trashFiles(files, 'a', 1).files
    expect(trashFiles(once, 'a', 2).files).toBe(once)
    expect(trashFiles(files, 'nope', 2).trashedIds).toEqual([])
  })

  it('purgeExpired removes only items older than 30 days, with their workbooks', () => {
    const day = 24 * 60 * 60 * 1000
    const slots = { wa: makeWorkbook('wa', 'A'), wb: makeWorkbook('wb', 'B'), wc: makeWorkbook('wc', 'C') }
    const files: FileItem[] = [
      { ...makeFile('a', 'wa'), deletedAt: 0 },
      { ...makeFile('b', 'wb'), deletedAt: 20 * day },
      makeFile('c', 'wc'),
    ]
    const r = purgeExpired(files, slots, 31 * day)
    expect(r.files.map((f) => f.id)).toEqual(['b', 'c'])
    expect(Object.keys(r.workbookSlots).sort()).toEqual(['wb', 'wc'])
    expect(r.removedIds).toEqual(['a'])
  })

  it('deleteForever and emptyTrash only touch trashed items', () => {
    const slots = { wa: makeWorkbook('wa', 'A'), wb: makeWorkbook('wb', 'B') }
    const files: FileItem[] = [makeFile('a', 'wa'), { ...makeFile('b', 'wb'), deletedAt: 5 }]
    expect(deleteForever(files, slots, 'a').files).toBe(files)
    expect(deleteForever(files, slots, 'b').files.map((f) => f.id)).toEqual(['a'])
    const emptied = emptyTrash(files, slots)
    expect(emptied.files.map((f) => f.id)).toEqual(['a'])
    expect(Object.keys(emptied.workbookSlots)).toEqual(['wa'])
  })

  it('removing a folder returns surviving children to the root instead of orphaning them', () => {
    const r = removeFiles([folder, inDir('x')], {}, new Set(['dir']))
    expect(r.files.map((f) => [f.id, f.parentId])).toEqual([['x', null]])
  })

  it('never switches to or lands on a trashed file', () => {
    const files: FileItem[] = [{ ...makeFile('a', 'wa'), deletedAt: 1 }, makeFile('b', 'wb')]
    expect(computePostDeleteSwitch(files)).toEqual({ type: 'switch', fileId: 'b' })
    expect(computePostDeleteSwitch([files[0]])).toEqual({ type: 'create-fallback', name: 'My Workbook' })
    expect(
      switchFileState({ workbookSlots: {}, files, activeFileId: 'b', workbook: makeWorkbook('wb', 'B'), targetId: 'a' }),
    ).toBeNull()
  })

  it('resolveInitialState purges old trash and seeds a live file when every file is trashed', () => {
    const day = 24 * 60 * 60 * 1000
    const persisted: PersistedState = {
      workbooks: { wa: makeWorkbook('wa', 'A'), wb: makeWorkbook('wb', 'B') },
      files: [
        { ...makeFile('a', 'wa'), deletedAt: 39 * day },
        { ...makeFile('b', 'wb'), deletedAt: 0 },
      ],
      activeFileId: 'a',
      activeWorkbookId: 'wa',
      messages: [] as ChatMessage[],
    }
    const r = resolveInitialState(persisted, 40 * day)
    expect(r.files.map((f) => f.id)).toContain('a') // 1 day in Trash: kept
    expect(r.files.map((f) => f.id)).not.toContain('b') // 40 days: purged
    expect(r.workbookSlots.wb).toBeUndefined()
    expect(r.workbookSlots.wa).toBeDefined()
    expect(r.activeFileId).not.toBe('a') // never opens a trashed file
    expect(r.files.find((f) => f.id === r.activeFileId)!.deletedAt).toBeUndefined()
  })
})
describe('per-file undo history', () => {
  const entry = (id: string) => ({ id }) as unknown as HistoryEntry
  const slot = (n: number): UndoSlot => ({ undoStack: Array.from({ length: n }, (_, i) => entry(String(i))), redoStack: [] })

  it('parks history per file and ignores empty history', () => {
    let slots = stashUndoSlot({}, 'a', slot(2))
    slots = stashUndoSlot(slots, 'b', slot(0))
    expect(Object.keys(slots)).toEqual(['a'])
    expect(slots.a.undoStack).toHaveLength(2)
  })

  it('re-parking a file replaces its old entry', () => {
    let slots = stashUndoSlot({}, 'a', slot(2))
    slots = stashUndoSlot(slots, 'a', slot(0))
    expect(slots).toEqual({})
  })

  it('keeps at most MAX_UNDO_SLOTS files, dropping the least recently parked', () => {
    let slots: Record<string, UndoSlot> = {}
    for (const id of ['a', 'b', 'c', 'd']) slots = stashUndoSlot(slots, id, slot(1))
    expect(Object.keys(slots)).toEqual(['b', 'c', 'd'])
  })

  it('dropUndoSlots forgets deleted files', () => {
    const slots = stashUndoSlot(stashUndoSlot({}, 'a', slot(1)), 'b', slot(1))
    expect(Object.keys(dropUndoSlots(slots, ['a']))).toEqual(['b'])
  })
})
describe('buildPersistenceSnapshot', () => {
  it('collapses the live workbook into the active file’s slot', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A'), wb2: makeWorkbook('wb2', 'B') }
    const files = [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')]
    const live = { ...slots.wb2, name: 'B-edited' }
    const messages: ChatMessage[] = [{ id: 'm1', role: 'assistant', content: 'hi', timestamp: 1 }]

    const snapshot = buildPersistenceSnapshot({ workbook: live, workbookSlots: slots, files, activeFileId: 'f2', messages })

    expect(snapshot.activeFileId).toBe('f2')
    expect(snapshot.activeWorkbookId).toBe('wb2')
    expect(snapshot.workbooks.wb2).toBe(live)
    expect(snapshot.workbooks.wb1).toBe(slots.wb1)
    expect(snapshot.messages).toBe(messages)
  })

  it('handles a missing active file', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A') }
    const files = [makeFile('f1', 'wb1')]
    const snapshot = buildPersistenceSnapshot({
      workbook: slots.wb1,
      workbookSlots: slots,
      files,
      activeFileId: null,
      messages: [],
    })
    expect(snapshot.activeWorkbookId).toBeNull()
    expect(snapshot.workbooks.wb1).toBe(slots.wb1)
  })
})

describe('addFileState workbook ids', () => {
  it('gives a new workbook a fresh id when its id is already used, so no other file is overwritten', () => {
    const live = makeWorkbook('wb1', 'Open')
    const other = makeWorkbook('wb2', 'Other')
    const files = [makeFile('f1', 'wb1'), makeFile('f2', 'wb2')]
    const collide = makeWorkbook('wb2', 'Backup of Other') // same id as the other file's workbook
    const next = addFileState({ workbookSlots: { wb2: other }, files, activeFileId: 'f1', workbook: live, newWorkbook: collide, name: 'Restored' })
    expect(next.workbook.id).not.toBe('wb2')
    expect(next.workbookSlots.wb2).toBe(other)
    expect(next.files[2].workbookId).toBe(next.workbook.id)
    expect(next.workbookSlots.wb1).toBe(live)
  })

  it('keeps the id when it is free, and assigns one when it is missing', () => {
    const live = makeWorkbook('wb1', 'Open')
    const files = [makeFile('f1', 'wb1')]
    const free = addFileState({ workbookSlots: {}, files, activeFileId: 'f1', workbook: live, newWorkbook: makeWorkbook('fresh', 'A'), name: 'A' })
    expect(free.workbook.id).toBe('fresh')
    const noId = { ...makeWorkbook('x', 'B'), id: '' }
    expect(addFileState({ workbookSlots: {}, files, activeFileId: 'f1', workbook: live, newWorkbook: noId, name: 'B' }).workbook.id).toBeTruthy()
  })
})