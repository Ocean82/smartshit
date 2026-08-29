import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileItem, SheetData, WorkbookData } from '@/types'
import {
  createEmptyWorkbook,
  SpreadsheetEngine,
} from '@/engine/spreadsheet'
import { loadPersistedState } from '@/lib/persistence'
import { defaultSkills } from '@/data/chatPresets'
import { v4 as uuid } from 'uuid'
import {
  createUIState,
  createUIActions,
  createFileActions,
  createHistoryActions,
  createWorkbookActions,
  createChatActions,
  createWelcomeMessage,
} from './slices'
import type { AppState } from './storeTypes'
import { applyWorkbookImportEffects } from './importOrchestration'

export type { AppState } from './storeTypes'

export const useStore = create<AppState>()(
  immer((set, get) => {
    const engine = new SpreadsheetEngine()
    const persisted = loadPersistedState()

    // All workbooks keyed by workbookId. The active file's workbook is loaded
    // from here and becomes the live `workbook`; the rest stay parked.
    const slots: Record<string, WorkbookData> = { ...(persisted?.workbooks ?? {}) }

    // Files are the source of truth. Seed a starter file only on first launch.
    let files: FileItem[]
    if (persisted?.files?.length) {
      files = persisted.files
    } else {
      const starter = createEmptyWorkbook('My Budget')
      slots[starter.id] = starter
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
      ? persisted!.activeFileId
      : (files.find((f) => f.type === 'file')?.id ?? files[0].id)
    const activeFile = files.find((f) => f.id === activeFileId)

    // Load the active workbook: prefer the active file's slot, then the denormalized
    // activeWorkbookId, then any slot, then a fresh workbook. A fresh workbook is
    // assigned the active file's id so the slot stays addressable.
    const activeSlotId = activeFile?.workbookId ?? persisted?.activeWorkbookId ?? null
    let initialWorkbook = activeSlotId && slots[activeSlotId] ? slots[activeSlotId] : null
    if (!initialWorkbook && persisted?.activeWorkbookId && slots[persisted.activeWorkbookId]) {
      initialWorkbook = slots[persisted.activeWorkbookId]
    }
    if (!initialWorkbook) {
      const firstKey = Object.keys(slots)[0]
      if (firstKey) initialWorkbook = slots[firstKey]
    }
    if (!initialWorkbook) {
      initialWorkbook = createEmptyWorkbook(activeFile?.name ?? 'My Budget')
      initialWorkbook.id = activeFile?.workbookId ?? initialWorkbook.id
      slots[initialWorkbook.id] = initialWorkbook
    }

    // Wire AI function registry to push async results back into cells
    engine.aiRegistry.setUpdateCallback((cellId, value) => {
      setTimeout(() => {
        const state = useStore.getState()
        const sheet = state.workbook.sheets.find((s) => s.id === state.activeSheetId)
        if (sheet && sheet.cells[cellId]) {
          useStore.setState((s) => {
            const sh = s.workbook.sheets.find((sh: SheetData) => sh.id === s.activeSheetId)
            if (sh && sh.cells[cellId]) {
              sh.cells[cellId].displayValue = value === null ? undefined : String(value)
            }
          })
        }
      }, 0)
    })

    /** Switch the live workbook to another file. Saves the current one first. */
    const swapToFile = (id: string) => {
      const s = useStore.getState()
      const target = s.files.find((f) => f.id === id)
      if (!target || target.type !== 'file' || id === s.activeFileId) return

      let wbId = target.workbookId
      if (!wbId) {
        // Legacy file without a workbook slot — attach one lazily.
        wbId = uuid()
        useStore.setState((st) => {
          const f = st.files.find((x) => x.id === id)
          if (f) f.workbookId = wbId
        })
      }

      // Stash the live workbook into its own slot (guard: file may have been deleted).
      const currentFile = useStore.getState().files.find((f) => f.id === s.activeFileId)
      if (currentFile && currentFile.workbookId && currentFile.id !== id) {
        useStore.setState((st) => {
          st.workbookSlots[currentFile.workbookId!] = st.workbook
        })
      }

      // Load the target workbook, creating one lazily if it was never opened.
      let wb = useStore.getState().workbookSlots[wbId]
      if (!wb) {
        wb = createEmptyWorkbook(target.name)
        wb.id = wbId
      }

      useStore.getState().loadWorkbookData(wb)
      useStore.setState((st) => {
        st.activeFileId = id
        st.workbookSlots[wbId!] = wb
      })
    }

    const uiState = createUIState()
    const uiActions = createUIActions(
      set as unknown as (fn: (s: typeof uiState) => void) => void,
      () => get() as unknown as typeof uiState,
    )
    const fileActions = createFileActions(
      set as unknown as (fn: (s: { files: FileItem[]; activeFileId: string | null }) => void) => void,
    )
    const historyActions = createHistoryActions(
      set as unknown as Parameters<typeof createHistoryActions>[0],
      get as unknown as Parameters<typeof createHistoryActions>[1],
    )
    const workbookActions = createWorkbookActions(
      set as unknown as Parameters<typeof createWorkbookActions>[0],
      get as unknown as Parameters<typeof createWorkbookActions>[1],
    )
    const chatActions = createChatActions(
      set as unknown as Parameters<typeof createChatActions>[0],
      get as unknown as Parameters<typeof createChatActions>[1],
    )

    return {
      workbook: initialWorkbook,
      engine,
      activeSheetId: initialWorkbook.activeSheetId,
      selection: null,
      editingCell: null,
      editValue: '',
      ...uiState,
      ...uiActions,

      lastAuditResult: null,

      undoStack: [],
      redoStack: [],
      files,
      activeFileId,
      workbookSlots: slots,
      messages: persisted?.messages?.length ? persisted.messages : [createWelcomeMessage()],
      chatInput: '',
      isAiProcessing: false,
      attachedFilePreview: null,
      skills: defaultSkills,
      clipboard: null,
      copiedRange: null,
      additionalSelections: [],
      activeFilters: [],
      activeSortConfig: null,

      ...fileActions,

      // Per-file workbook switching: saves the live workbook to its slot, then
      // loads the target file's workbook (created lazily if never opened).
      openFile: (id: string) => swapToFile(id),

      // Remove a file's workbook data along with the file itself, and switch
      // the active file when the one being deleted was active.
      deleteFile: (id: string) => {
        const state = useStore.getState()
        const target = state.files.find((f) => f.id === id)
        if (target?.workbookId) {
          useStore.setState((st) => {
            delete st.workbookSlots[target.workbookId!]
          })
        }
        fileActions.deleteFile(id)
        if (target && state.activeFileId === id) {
          const remaining = useStore.getState().files.filter((f) => f.type === 'file')
          if (remaining.length) {
            swapToFile(remaining[0].id)
          } else {
            fileActions.createFile('My Workbook')
            swapToFile(useStore.getState().files[0].id)
          }
        }
      },

      ...historyActions,
      ...workbookActions,
      ...chatActions,

      // Wrap data-only import with chat/insights/audit orchestration
      importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string }) => {
        workbookActions.importWorkbook(workbook, meta)
        applyWorkbookImportEffects(
          set as unknown as Parameters<typeof applyWorkbookImportEffects>[0],
          get as unknown as Parameters<typeof applyWorkbookImportEffects>[1],
          workbook,
          meta,
        )
      },

      // New Workbook replaces the active file's content: rebind the file's
      // workbookId to the fresh workbook and drop the previous slot.
      initWorkbook: (name?: string) => {
        const s = useStore.getState()
        const current = s.files.find((f) => f.id === s.activeFileId)
        if (current?.workbookId) {
          const oldId = current.workbookId
          useStore.setState((st) => {
            delete st.workbookSlots[oldId]
          })
        }
        workbookActions.initWorkbook(name)
        const fresh = useStore.getState().workbook
        useStore.setState((st) => {
          const f = st.files.find((x) => x.id === st.activeFileId)
          if (f) f.workbookId = fresh.id
          st.workbookSlots[fresh.id] = fresh
        })
      },
    }
  }),
)
