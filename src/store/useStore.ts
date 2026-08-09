import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  ChatMessage,
  FileItem,
  SheetData,
} from '@/types'
import {
  createEmptyWorkbook,
  refToCell,
  SpreadsheetEngine,
} from '@/engine/spreadsheet'
import { executeTemplateTool } from '@/templates'
import { loadPersistedState } from '@/lib/persistence'
import { buildFilePreview } from '@/ai/filePreview'
import { recordTelemetry } from '@/ai/telemetry'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import type { ExecutionResult } from '@/agent'
import { v4 as uuid } from 'uuid'
import { defaultSkills } from '@/data/chatPresets'
import {
  createUIState,
  createUIActions,
  createFileActions,
  createHistoryActions,
  createWorkbookActions,
} from './slices'
import type { AppState } from './storeTypes'
import {
  processAICommand,
  estimateActionChangeCount,
  buildExecutionContext,
  executeAction,
} from './aiExecution'

export type { AppState } from './storeTypes'

export const useStore = create<AppState>()(
  immer((set, get) => {
    const engine = new SpreadsheetEngine()
    const persisted = loadPersistedState()
    const initialWorkbook = persisted?.workbook ?? createEmptyWorkbook('My Budget')

    // Wire AI function registry to push async results back into cells
    engine.aiRegistry.setUpdateCallback((cellId, value) => {
      // Schedule a state update to re-render cells with resolved AI values.
      // The actual value is in the registry cache — this setState simply forces
      // a re-render so getComputedValue picks up the cached result.
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

    const defaultWelcome: ChatMessage = {
      id: uuid(),
      role: 'assistant',
      content: `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nI only apply changes after you review and approve them.`,
      timestamp: Date.now(),
    }

    // ─── Slice composition ───────────────────────────────────────────────────
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
      messages: persisted?.messages?.length ? persisted.messages : [defaultWelcome],
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

      setChatInput: (val) => set((s) => { s.chatInput = val }),

      addMessage: (msg) => set((s) => { s.messages.push(msg) }),

      clearChat: () => set((s) => {
        s.messages = [{
          id: uuid(),
          role: 'assistant',
          content: `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nI only apply changes after you review and approve them.`,
          timestamp: Date.now(),
        }]
        s.chatInput = ''
        s.isAiProcessing = false
      }),

      togglePinMessage: (messageId) => set((s) => {
        const msg = s.messages.find((m) => m.id === messageId)
        if (msg) msg.pinned = !msg.pinned
      }),

      getPinnedMessages: () => {
        return get().messages.filter((m) => m.pinned)
      },

      sendMessage: () => {
        const input = get().chatInput.trim()
        if (!input) return

        const userMsg: ChatMessage = {
          id: uuid(),
          role: 'user',
          content: input,
          timestamp: Date.now(),
        }

        const streamingMsgId = uuid()
        const streamingMsg: ChatMessage = {
          id: streamingMsgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
        }

        set((s) => {
          s.messages.push(userMsg)
          s.messages.push(streamingMsg)
          s.chatInput = ''
          s.isAiProcessing = true
        })

        // Delegate to the chat service
        void import('@/services/chatService').then(({ processChatMessage }) => {
          void processChatMessage(input, streamingMsgId, {
            getWorkbook: () => get().workbook,
            getActiveSheet: () => get().getActiveSheet(),
            getComputedValue: (row, col) => get().getComputedValue(row, col),
            getSheetComputedValue: (sheetId, row, col) => {
              const state = get()
              const targetSheet = state.workbook.sheets.find((candidate) => candidate.id === sheetId)
              const cell = targetSheet?.cells[refToCell(row, col)]
              if (cell?.formula && state.engine.isAIFormula(cell.formula)) {
                return cell.displayValue == null ? String(cell.value ?? '') : String(cell.displayValue)
              }
              return state.engine.getComputedValue(sheetId, row, col)
            },
            getSelection: () => get().selection,
            getActiveSheetId: () => get().activeSheetId,
            getAttachedPreview: () => get().attachedFilePreview,
            getMessages: () => get().messages,
            setActiveSheet: (sheetId) => set((s) => { s.activeSheetId = sheetId }),
            pushHistory: (desc) => get().pushHistory(desc),
            buildExecContext: (opts) => buildExecutionContext(get, set, opts),
            appendToken: (msgId, token) => {
              set((s) => {
                const msg = s.messages.find((m) => m.id === msgId)
                if (msg) msg.content += token
              })
            },
            finalizeMessage: (msgId, msg) => {
              set((s) => {
                const idx = s.messages.findIndex((m) => m.id === msgId)
                if (idx >= 0) s.messages[idx] = msg
              })
            },
            setProcessing: (v) => set((s) => { s.isAiProcessing = v }),
            processLocalFallback: (fallbackInput) => processAICommand(fallbackInput, get),
          })
        })
      },

      runTemplateTool: (tool) => {
        get().setShowChat(true)
        const label = tool.replace(/^create_/, '').replace(/_/g, ' ')
        get().pushHistory(`Template: ${label}`)
        const ctx = buildExecutionContext(get, set, { suppressHistory: true })
        const result = executeTemplateTool(tool, {}, ctx)
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          content: result.success
            ? `✓ ${result.message}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} filled)` : ''}`
            : `⚠️ ${result.message}`,
          timestamp: Date.now(),
        })
      },

      attachFileForChat: async (file) => {
        const maxBytes = AI_ANALYSIS_CONFIG.maxFileSizeMb * 1024 * 1024
        if (file.size > maxBytes) {
          get().addMessage({
            id: uuid(),
            role: 'assistant',
            content: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${AI_ANALYSIS_CONFIG.maxFileSizeMb} MB.`,
            timestamp: Date.now(),
          })
          return
        }

        try {
          const preview = await buildFilePreview(file, (workbook, row, col) => {
            const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId) ?? workbook.sheets[0]
            const cellId = refToCell(row, col)
            const val = sheet.cells[cellId]?.value
            return val === null || val === undefined ? '' : String(val)
          })
          if (preview.importWarnings?.length) {
            recordTelemetry('importTruncationEvents', `Chat attach: ${file.name}`)
          }
          set((s) => { s.attachedFilePreview = preview })
        } catch {
          get().addMessage({
            id: uuid(),
            role: 'assistant',
            content: `Could not read **${file.name}**. Make sure it is a valid .xlsx or .csv file.`,
            timestamp: Date.now(),
          })
        }
      },

      importAttachedFile: async () => {
        const preview = get().attachedFilePreview
        if (!preview) return
        get().importWorkbook(preview.workbook, { fileName: preview.fileName })
        set((s) => { s.attachedFilePreview = null })
        get().addMessage({
          id: uuid(),
          role: 'assistant',
          content: `Imported **${preview.fileName}** into your workbook. Ask me to explain the data or build a budget from it.`,
          timestamp: Date.now(),
        })
      },

      clearAttachedFile: () => set((s) => { s.attachedFilePreview = null }),

      applyAction: (actionId) => {
        const state = get()
        const highImpactTools = new Set([
          'clear_sheet',
          'clean_sheet_data',
          'delete_row',
          'modify_column',
        ])
        // Find the action
        for (const msg of state.messages) {
          if (msg.actions) {
            const action = msg.actions.find((a) => a.id === actionId)
            if (action && action.status === 'pending') {
              const estimatedChanges = estimateActionChangeCount(action)
              const requiresPreview = highImpactTools.has(action.tool) && !action.preview
              if (requiresPreview) {
                recordTelemetry('previewDeniedActions', action.tool)
                get().addMessage({
                  id: uuid(),
                  role: 'assistant',
                  content: `I need to show a preview before applying **${action.tool}** because it can affect many cells. Ask me to regenerate this action with a preview.`,
                  timestamp: Date.now(),
                })
                return
              }

              const historyLabel = estimatedChanges > 0
                ? `AI Action: ${action.description} (~${estimatedChanges} changes)`
                : `AI Action: ${action.description}`
              // Macro undo manager owns the transaction — do not pushHistory before
              if (action.tool !== 'execute_macro') {
                get().pushHistory(historyLabel)
              }

              const finishAction = (result: ExecutionResult) => {
                set((s) => {
                  for (const m of s.messages) {
                    if (m.actions) {
                      const a = m.actions.find((act) => act.id === actionId)
                      if (a) a.status = result.success ? 'applied' : 'rejected'
                    }
                  }
                })
                if (!result.success) {
                  get().addMessage({
                    id: uuid(),
                    role: 'assistant',
                    content: `⚠️ ${result.message}`,
                    timestamp: Date.now(),
                  })
                }
              }

              const execution = executeAction(action, get, set)
              if (execution instanceof Promise) {
                void execution
                  .then(finishAction)
                  .catch((err) => finishAction({
                    success: false,
                    message: err instanceof Error ? err.message : 'The action failed unexpectedly.',
                    modified: 0,
                  }))
              } else {
                finishAction(execution)
              }
              break
            }
          }
        }
      },

      rejectAction: (actionId) => {
        set((s) => {
          for (const msg of s.messages) {
            if (msg.actions) {
              const action = msg.actions.find((a) => a.id === actionId)
              if (action) action.status = 'rejected'
            }
          }
        })
      },
    }
  }),
)
