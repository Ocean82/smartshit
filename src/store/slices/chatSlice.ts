/**
 * Chat slice — messages, AI send/apply flow, attachments, templates.
 */

import type { ChatMessage, Skill, WorkbookData, Selection, SheetData } from '@/types'
import type { AttachedFilePreview } from '@/ai/types'
import type { SpreadsheetEngine } from '@/engine/spreadsheet'
import { refToCell } from '@/engine/spreadsheet'
import { executeTemplateTool } from '@/templates'
import { buildFilePreview } from '@/ai/filePreview'
import { recordTelemetry } from '@/ai/telemetry'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import type { ExecutionResult } from '@/agent'
import { v4 as uuid } from 'uuid'
import {
  processAICommand,
  estimateActionChangeCount,
  buildExecutionContext,
  executeAction,
} from '../aiExecution'

export const DEFAULT_WELCOME_CONTENT =
  `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nI only apply changes after you review and approve them.`

export function createWelcomeMessage(): ChatMessage {
  return {
    id: uuid(),
    role: 'assistant',
    content: DEFAULT_WELCOME_CONTENT,
    timestamp: Date.now(),
  }
}

export interface ChatState {
  messages: ChatMessage[]
  chatInput: string
  isAiProcessing: boolean
  attachedFilePreview: AttachedFilePreview | null
  skills: Skill[]
}

/** Dependencies chat actions need from the composed store. */
export interface ChatStoreAccess extends ChatState {
  workbook: WorkbookData
  engine: SpreadsheetEngine
  selection: Selection | null
  activeSheetId: string
  showChat: boolean
  getActiveSheet: () => SheetData
  getComputedValue: (row: number, col: number) => string
  setShowChat: (v: boolean) => void
  setActivePanel: (panel: 'chat' | 'insights' | 'auditor' | 'inspector' | null) => void
  showToast: (toast: Omit<import('@/types').Toast, 'id'>) => void
  pushHistory: (desc: string) => void
  importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string }) => void
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellFormat: (cellId: string, format: Partial<import('@/types').CellFormat>) => void
  bulkSetCells: (cells: Record<string, { value: string | number | boolean | null; formula?: string }>) => void
  applySortPatch: (patch: import('@/lib/sheetSort').SortPatch) => void
  setFilters: (filters: import('@/types').FilterConfig[]) => void
  deleteRow: (row: number) => void
  insertRow: (afterRow: number) => void
  addSheet: (name?: string) => void
  renameSheet: (sheetId: string, name: string) => void
  addChart: (chart: import('@/types').ChartConfig) => void
  additionalSelections: Selection[]
}

export interface ChatActions {
  setChatInput: (val: string) => void
  addMessage: (msg: ChatMessage) => void
  sendMessage: () => void
  clearChat: () => void
  togglePinMessage: (messageId: string) => void
  getPinnedMessages: () => ChatMessage[]
  runTemplateTool: (tool: string) => void
  attachFileForChat: (file: File) => Promise<void>
  importAttachedFile: () => Promise<void>
  clearAttachedFile: () => void
  applyAction: (actionId: string) => void
  rejectAction: (actionId: string) => void
}

export function createChatActions(
  set: (fn: (s: ChatStoreAccess) => void) => void,
  get: () => ChatStoreAccess,
): ChatActions {
  return {
    setChatInput: (val) => set((s) => { s.chatInput = val }),

    addMessage: (msg) => set((s) => { s.messages.push(msg) }),

    clearChat: () => set((s) => {
      s.messages = [createWelcomeMessage()]
      s.chatInput = ''
      s.isAiProcessing = false
    }),

    togglePinMessage: (messageId) => set((s) => {
      const msg = s.messages.find((m) => m.id === messageId)
      if (msg) msg.pinned = !msg.pinned
    }),

    getPinnedMessages: () => get().messages.filter((m) => m.pinned),

    sendMessage: () => {
      const input = get().chatInput.trim()
      if (!input) return

      // Lazy-init NLP engine on first message (downloads 22MB model in background).
      // Respects data-saver mode — skips if user has requested reduced data usage.
      import('@/ai/nlp/nlpEngine').then(({ getNLPEngine }) => {
        const engine = getNLPEngine()
        if (!engine.isReady && !engine.status.initialized) {
          const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection
          if (!conn?.saveData) {
            engine.startInit()
          }
        }
      })

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
      get().setActivePanel('chat')

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
          buildExecContext: (opts) => buildExecutionContext(get as never, set as never, opts),
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
          processLocalFallback: (fallbackInput) => processAICommand(fallbackInput, get as never),
        })
      })
    },

    runTemplateTool: (tool) => {
      const label = tool.replace(/^create_/, '').replace(/_/g, ' ')
      get().pushHistory(`Template: ${label}`)
      const ctx = buildExecutionContext(get as never, set as never, { suppressHistory: true })
      const result = executeTemplateTool(tool, {}, ctx)
      set((s) => {
        s.messages.push({
          id: uuid(),
          role: 'assistant',
          content: result.success
            ? `✓ ${result.message}${result.modified > 0 ? ` (${result.modified} cell${result.modified === 1 ? '' : 's'} filled)` : ''}`
            : `⚠️ ${result.message}`,
          timestamp: Date.now(),
        })
      })
      get().showToast({
        type: result.success ? 'success' : 'error',
        message: result.success ? `${result.message}` : result.message,
        action: {
          label: 'View in chat',
          onClick: () => get().setActivePanel('chat'),
        },
      })
    },

    attachFileForChat: async (file) => {
      const maxBytes = AI_ANALYSIS_CONFIG.maxFileSizeMb * 1024 * 1024
      if (file.size > maxBytes) {
        set((s) => {
          s.messages.push({
            id: uuid(),
            role: 'assistant',
            content: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${AI_ANALYSIS_CONFIG.maxFileSizeMb} MB.`,
            timestamp: Date.now(),
          })
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
        set((s) => {
          s.messages.push({
            id: uuid(),
            role: 'assistant',
            content: `Could not read **${file.name}**. Make sure it is a valid .xlsx or .csv file.`,
            timestamp: Date.now(),
          })
        })
      }
    },

    importAttachedFile: async () => {
      const preview = get().attachedFilePreview
      if (!preview) return
      get().importWorkbook(preview.workbook, { fileName: preview.fileName })
      set((s) => {
        s.attachedFilePreview = null
        s.messages.push({
          id: uuid(),
          role: 'assistant',
          content: `Imported **${preview.fileName}** into your workbook. Ask me to explain the data or build a budget from it.`,
          timestamp: Date.now(),
        })
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
      for (const msg of state.messages) {
        if (!msg.actions) continue
        const action = msg.actions.find((a) => a.id === actionId)
        if (!action || action.status !== 'pending') continue

        const estimatedChanges = estimateActionChangeCount(action)
        const requiresPreview = highImpactTools.has(action.tool) && !action.preview
        if (requiresPreview) {
          recordTelemetry('previewDeniedActions', action.tool)
          set((s) => {
            s.messages.push({
              id: uuid(),
              role: 'assistant',
              content: `I need to show a preview before applying **${action.tool}** because it can affect many cells. Ask me to regenerate this action with a preview.`,
              timestamp: Date.now(),
            })
          })
          return
        }

        const historyLabel = estimatedChanges > 0
          ? `AI Action: ${action.description} (~${estimatedChanges} changes)`
          : `AI Action: ${action.description}`
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
            if (!result.success) {
              s.messages.push({
                id: uuid(),
                role: 'assistant',
                content: `⚠️ ${result.message}`,
                timestamp: Date.now(),
              })
            }
          })
        }

        const execution = executeAction(action, get as never, set as never)
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
}
