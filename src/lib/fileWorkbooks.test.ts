import { describe, it, expect } from 'vitest'
import {
  resolveInitialState,
  switchFileState,
  computePostDeleteSwitch,
  rebindActiveFile,
  buildPersistenceSnapshot,
} from './fileWorkbooks'
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

describe('rebindActiveFile', () => {
  it('rebinds the active file and drops its old slot', () => {
    const slots = { old: makeWorkbook('old', 'Old'), other: makeWorkbook('other', 'Other') }
    const files = [makeFile('f1', 'old'), makeFile('f2', 'other')]
    const fresh = makeWorkbook('new', 'Fresh')

    const next = rebindActiveFile({ workbookSlots: slots, files, activeFileId: 'f1', workbook: fresh })

    expect(next.files.find((f) => f.id === 'f1')!.workbookId).toBe('new')
    expect(next.files.find((f) => f.id === 'f2')!.workbookId).toBe('other')
    expect(next.workbookSlots.old).toBeUndefined()
    expect(next.workbookSlots.new).toBe(fresh)
    expect(next.workbookSlots.other).toBe(slots.other)
  })

  it('is a no-op when the active file cannot be found', () => {
    const slots = { wb1: makeWorkbook('wb1', 'A') }
    const files = [makeFile('f1', 'wb1')]
    const fresh = makeWorkbook('new', 'Fresh')

    const next = rebindActiveFile({ workbookSlots: slots, files, activeFileId: 'ghost', workbook: fresh })

    expect(next.files).toEqual(files)
    expect(next.workbookSlots.wb1).toBe(slots.wb1)
    expect(next.workbookSlots.new).toBeUndefined()
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