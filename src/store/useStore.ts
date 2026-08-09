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
    const initialWorkbook = persisted?.workbook ?? createEmptyWorkbook('My Budget')

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

    const initialFile: FileItem = persisted?.files?.[0] ?? {
      id: uuid(),
      name: initialWorkbook.name,
      type: 'file',
      parentId: null,
      workbookId: initialWorkbook.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
      files: persisted?.files ?? [initialFile],
      activeFileId: persisted?.activeFileId ?? initialFile.id,
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
    }
  }),
)
