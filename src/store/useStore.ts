import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileItem, SheetData, WorkbookData } from '@/types'
import {
  SpreadsheetEngine,
} from '@/engine/spreadsheet'
import { loadPersistedState } from '@/lib/persistence'
import {
  resolveInitialState,
  switchFileState,
  computePostDeleteSwitch,
  rebindActiveFile,
} from '@/lib/fileWorkbooks'
import { defaultSkills } from '@/data/chatPresets'
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
    const seeded = resolveInitialState(persisted)

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
      const next = switchFileState({
        workbookSlots: s.workbookSlots,
        files: s.files,
        activeFileId: s.activeFileId,
        workbook: s.workbook,
        targetId: id,
      })
      if (!next) return

      useStore.getState().loadWorkbookData(next.workbook)
      useStore.setState((st) => {
        st.workbook = next.workbook
        st.workbookSlots = next.workbookSlots
        st.files = next.files
        st.activeFileId = next.activeFileId
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
      workbook: seeded.workbook,
      engine,
      activeSheetId: seeded.workbook.activeSheetId,
      selection: null,
      editingCell: null,
      editValue: '',
      ...uiState,
      ...uiActions,

      lastAuditResult: null,

      undoStack: [],
      redoStack: [],
      files: seeded.files,
      activeFileId: seeded.activeFileId,
      workbookSlots: seeded.workbookSlots,
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
        if (!target) return
        if (target.workbookId) {
          useStore.setState((st) => {
            delete st.workbookSlots[target.workbookId!]
          })
        }
        const wasActive = state.activeFileId === id
        fileActions.deleteFile(id)
        if (wasActive) {
          const decision = computePostDeleteSwitch(useStore.getState().files)
          if (decision.type === 'switch') {
            swapToFile(decision.fileId)
          } else if (decision.type === 'create-fallback') {
            fileActions.createFile(decision.name)
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
        workbookActions.initWorkbook(name)
        const s = useStore.getState()
        const next = rebindActiveFile({
          workbookSlots: s.workbookSlots,
          files: s.files,
          activeFileId: s.activeFileId,
          workbook: s.workbook,
        })
        useStore.setState((st) => {
          st.workbookSlots = next.workbookSlots
          st.files = next.files
        })
      },
    }
  }),
)
