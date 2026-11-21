import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { FileItem, SheetData, WorkbookData } from '@/types'
import {
  SpreadsheetEngine,
  createEmptyWorkbook,
} from '@/engine/spreadsheet'
import { loadPersistedState, clearPersistedState } from '@/lib/persistence'
import { clearUserApiKey } from '@/lib/userApiKey'
import { USER_ID_KEY, LAST_CLOUD_USER_KEY, IMPORT_SHARED_KEY } from '@/lib/authKeys'
import {
  resolveInitialState,
  switchFileState,
  computePostDeleteSwitch,
  addFileState,
  trashFiles,
  restoreFiles,
  deleteForever,
  emptyTrash,
  stashUndoSlot,
  dropUndoSlots,
  uniqueFileName,
  type SwitchResult,
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
import { runAudit } from '@/auditor'
import { loadCustomRules } from '@/auditor/customRules'
import { findingKey, cellSignature } from '@/auditor/utils'
import { isAuditorEnabled, saveAuditorEnabled, loadDismissed, saveDismissed } from '@/auditor/preferences'
import type { AuditFinding } from '@/auditor/types'

export type { AppState } from './storeTypes'

export const useStore = create<AppState>()(
  immer((set, get) => {
    const engine = new SpreadsheetEngine()
    const persisted = loadPersistedState()
    const seeded = resolveInitialState(persisted)

    // Wire AI function registry to push async results back into the owning sheet
    engine.aiRegistry.setUpdateCallback((sheetId, cellId, value) => {
      setTimeout(() => {
        useStore.setState((s) => {
          const sh = s.workbook.sheets.find((sheet: SheetData) => sheet.id === sheetId)
          if (sh && sh.cells[cellId]) {
            sh.cells[cellId].displayValue = value === null ? undefined : String(value)
          }
        })
      }, 0)
    })

    engine.setSheetLoadErrorHandler((sheetName) => {
      // Deferred: loads can run during store creation or inside set().
      setTimeout(() => {
        useStore.getState().showToast({
          type: 'warning',
          message: `Sheet "${sheetName}" couldn't be fully loaded. Formulas that use it may show wrong results.`,
        })
      }, 0)
    })

    /**
     * Make `next` the open file. The outgoing file's undo history is parked and
     * the incoming file's restored, and per-document UI state (selection, edit
     * in progress, filters, sort) is cleared so nothing leaks between files.
     */
    const applyFileSwitch = (next: SwitchResult) => {
      const s = useStore.getState()
      let undoSlots = s.activeFileId
        ? stashUndoSlot(s.undoSlots, s.activeFileId, { undoStack: s.undoStack, redoStack: s.redoStack })
        : s.undoSlots
      const incoming = undoSlots[next.activeFileId]
      if (incoming) undoSlots = dropUndoSlots(undoSlots, [next.activeFileId])
      s.loadWorkbookData(next.workbook)
      useStore.setState((st) => {
        st.workbook = next.workbook
        st.workbookSlots = next.workbookSlots
        st.files = next.files
        st.activeFileId = next.activeFileId
        st.undoSlots = undoSlots
        st.undoStack = incoming?.undoStack ?? []
        st.redoStack = incoming?.redoStack ?? []
        st.selection = null
        st.editingCell = null
        st.editValue = ''
        st.additionalSelections = []
        st.copiedRange = null
        st.activeFilters = []
        st.activeSortConfig = null
      })
    }
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
      if (next) applyFileSwitch(next)
    }
    /** Open `workbook` as a new file next to the others. The current file is kept as it is. */
    const openAsNewFile = (workbook: WorkbookData, name: string) => {
      const s = useStore.getState()
      applyFileSwitch(addFileState({
        workbookSlots: s.workbookSlots,
        files: s.files,
        activeFileId: s.activeFileId,
        workbook: s.workbook,
        newWorkbook: workbook,
        name: uniqueFileName(s.files, name),
      }))
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
      workbookRevision: 0,
      selection: null,
      editingCell: null,
      editValue: '',
      ...uiState,
      ...uiActions,

      lastAuditResult: null,
      lastAuditRevision: null,
      auditResultsBySheet: {},
      auditorEnabled: isAuditorEnabled(),
      runActiveSheetAudit: () => {
        const state = useStore.getState()
        const result = runAudit(
          state.getActiveSheet(),
          state.getComputedValue,
          loadCustomRules(),
          loadDismissed(state.workbook.id),
        )
        useStore.setState((st) => {
          st.lastAuditResult = result
          st.lastAuditRevision = st.workbookRevision
          st.auditResultsBySheet[result.sheetId] = { result, revision: st.workbookRevision }
        })
        return result
      },
      setAuditorEnabled: (enabled: boolean) => {
        saveAuditorEnabled(enabled)
        useStore.setState((st) => {
          st.auditorEnabled = enabled
          if (!enabled) {
            // Drop results so the badges, status bar and rail counts disappear.
            st.lastAuditResult = null
            st.lastAuditRevision = null
            st.auditResultsBySheet = {}
          }
        })
      },
      dismissAuditFinding: (finding: AuditFinding) => {
        const state = useStore.getState()
        const sheet = state.getActiveSheet()
        // ponytail: entries are never pruned; a workbook would need thousands of dismissals to matter.
        const dismissed = loadDismissed(state.workbook.id)
        dismissed[findingKey(sheet.id, finding)] = {
          cellIds: finding.cells.map((c) => c.cellId),
          dismissedAt: Date.now(),
          valueSnapshot: Object.fromEntries(finding.cells.map((c) => [c.cellId, cellSignature(sheet.cells[c.cellId])])),
        }
        saveDismissed(state.workbook.id, dismissed)
        state.runActiveSheetAudit()
      },
      restoreAuditFindings: (findings: AuditFinding[]) => {
        const state = useStore.getState()
        const sheetId = state.getActiveSheet().id
        const dismissed = loadDismissed(state.workbook.id)
        for (const finding of findings) delete dismissed[findingKey(sheetId, finding)]
        saveDismissed(state.workbook.id, dismissed)
        state.runActiveSheetAudit()
      },

      undoStack: [],
      redoStack: [],
      files: seeded.files,
      activeFileId: seeded.activeFileId,
      workbookSlots: seeded.workbookSlots,
      undoSlots: {},
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

      // Delete moves the file (or folder and its contents) to Trash. Its workbook
      // is kept, so Restore brings back exactly what was there. If the open file
      // is trashed, another live file opens first (its content is saved to its slot).
      deleteFile: (id: string) => {
        const state = useStore.getState()
        const { files, trashedIds } = trashFiles(state.files, id, Date.now())
        if (trashedIds.length === 0) return
        useStore.setState((st) => {
          st.files = files
        })
        if (state.activeFileId && trashedIds.includes(state.activeFileId)) {
          const decision = computePostDeleteSwitch(useStore.getState().files)
          if (decision.type === 'switch') {
            swapToFile(decision.fileId)
          } else {
            fileActions.createFile(decision.name)
            const all = useStore.getState().files
            swapToFile(all[all.length - 1].id)
          }
        }
      },
      restoreFile: (id: string) => {
        useStore.setState((st) => {
          st.files = restoreFiles(st.files, id)
        })
      },
      deleteFileForever: (id: string) => {
        const s = useStore.getState()
        const r = deleteForever(s.files, s.workbookSlots, id)
        if (r.removedIds.length === 0) return
        useStore.setState((st) => {
          st.files = r.files
          st.workbookSlots = r.workbookSlots
          st.undoSlots = dropUndoSlots(st.undoSlots, r.removedIds)
        })
      },
      emptyTrash: () => {
        const s = useStore.getState()
        const r = emptyTrash(s.files, s.workbookSlots)
        if (r.removedIds.length === 0) return
        useStore.setState((st) => {
          st.files = r.files
          st.workbookSlots = r.workbookSlots
          st.undoSlots = dropUndoSlots(st.undoSlots, r.removedIds)
        })
      },
      // The file name is the workbook's name: exports, the AI and reports use
      // workbook.name, so rename keeps both in step.
      renameFile: (id: string, name: string) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((st) => {
          const file = st.files.find((f) => f.id === id)
          if (!file) return
          file.name = trimmed
          // The open file's content lives in `workbook` (its id can differ from the file's slot id after a replace).
          if (id === st.activeFileId) st.workbook.name = trimmed
          else if (file.workbookId && st.workbookSlots[file.workbookId]) st.workbookSlots[file.workbookId].name = trimmed
        })
      },
      clearCloudBindings: () => {
        set((st) => {
          for (const f of st.files) delete f.cloudWorkbookId
        })
      },

      // Keys WIPED: smartsht-state-v1 (+ .corrupt backup) and IndexedDB state-v1
      // (workbooks, chat), smartsht-user-id, smartsht-last-cloud-user,
      // smartsht-import-shared, smartsht-user-api-key (plaintext BYOK key).
      // Keys KEPT on purpose: smartsht_autofix_used (advisory lifetime limit; wiping
      // would let anyone reset it by signing out), UI preferences, custom audit
      // rules, cell notes, locally installed templates, telemetry.
      clearLocalWorkbooks: async () => {
        const fresh = resolveInitialState(null)
        useStore.getState().loadWorkbookData(fresh.workbook)
        useStore.setState((st) => {
          st.workbook = fresh.workbook
          st.workbookSlots = fresh.workbookSlots
          st.undoSlots = {}
          st.files = fresh.files
          st.activeFileId = fresh.activeFileId
          st.activeSheetId = fresh.workbook.activeSheetId
          st.messages = [createWelcomeMessage()]
          st.chatInput = ''
          st.attachedFilePreview = null
          st.undoStack = []
          st.redoStack = []
        })
        clearUserApiKey()
        try {
          localStorage.removeItem(USER_ID_KEY)
          localStorage.removeItem(LAST_CLOUD_USER_KEY)
          localStorage.removeItem(IMPORT_SHARED_KEY)
        } catch {
          // storage unavailable
        }
        await clearPersistedState()
      },

      ...historyActions,
      ...workbookActions,
      ...chatActions,

      // Wrap data-only import with chat/insights/audit orchestration.
      // Default replaces the open file's content (it is a new local workbook, not the
      // file's cloud workbook, so the cloud binding is cleared). With `asNewFile` the
      // workbook opens as its own file and nothing existing is touched.
      importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string; warnings?: string[]; asNewFile?: boolean }) => {
        if (meta?.asNewFile) {
          const base = (meta.fileName ?? workbook.name).replace(/\.(xlsx|xls|csv)$/i, '').trim()
          openAsNewFile(workbook, base || 'Imported workbook')
        } else {
          workbookActions.importWorkbook(workbook, meta)
          useStore.getState().setActiveFileCloudId(null)
          const active = useStore.getState().files.find((f) => f.id === useStore.getState().activeFileId)
          if (active) useStore.getState().renameFile(active.id, active.name)
        }
        applyWorkbookImportEffects(
          set as unknown as Parameters<typeof applyWorkbookImportEffects>[0],
          get as unknown as Parameters<typeof applyWorkbookImportEffects>[1],
          useStore.getState().workbook,
          meta,
        )
      },
      // New Workbook opens a blank file next to the others; nothing is replaced.
      initWorkbook: (name?: string) => {
        const title = name ?? 'Untitled Workbook'
        openAsNewFile(createEmptyWorkbook(title), title)
      },
    }
  }),
)

// ─── Workbook revision tracking ──────────────────────────────────────────────
// `workbookRevision` is the single monotonic counter that pending chat actions
// are bound to. It is derived here rather than at each mutation site so that
// *every* workbook change — a typed cell, a paste, a sort, an undo, an import,
// an async AI-formula result — invalidates proposals that were prepared against
// an earlier state. Anything that only touches selection or chat state leaves
// the reference untouched and therefore does not bump it.
let lastTrackedWorkbook = useStore.getState().workbook
let trackingRevision = false
useStore.subscribe((state) => {
  if (trackingRevision) return
  if (state.workbook === lastTrackedWorkbook) return
  lastTrackedWorkbook = state.workbook
  trackingRevision = true
  try {
    // Plain object update, NOT an immer producer: producing here would deep-freeze
    // the workbook that other code (and tests) still mutate in place.
    useStore.setState({ workbookRevision: useStore.getState().workbookRevision + 1 })
  } finally {
    trackingRevision = false
  }
})
