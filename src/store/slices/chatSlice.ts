/**
 * Chat slice — messages, AI send/apply flow, attachments, templates.
 */

import type { ChatMessage, Skill, WorkbookData, Selection, SheetData } from '@/types'
import { captureActionScope, actionScopeMatches, bindMessageActions } from '@/lib/actionScope'
import type { SandboxSuccess } from '@/sandbox'
import { cellToRef } from '@/engine/spreadsheet'
import type { AttachedFilePreview } from '@/ai/types'
import type { SpreadsheetEngine } from '@/engine/spreadsheet'
import { refToCell } from '@/engine/spreadsheet'
import { executeTemplateTool } from '@/templates'
import { buildFilePreview } from '@/ai/filePreview'
import { recordTelemetry } from '@/ai/telemetry'
import {
  isCapabilitySkipMessage,
  stripCapabilitySkipPrefix,
  parseCapabilityPickMessage,
} from '@/ai/capabilities/clarifyChips'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import type { ExecutionResult } from '@/agent'
import { buildScriptPreview } from '@/lib/scriptPreview'
import { v4 as uuid } from 'uuid'
import {
  processAICommand,
  estimateActionChangeCount,
  buildExecutionContext,
  executeAction,
  applyPreparedScript,
} from '../aiExecution'

export const DEFAULT_WELCOME_CONTENT =
  `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nDirect commands such as formatting, sorting, and building templates run immediately and can be undone. Proposed actions show Apply/Reject controls. Script changes are previewed before they are applied.`

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
  importWorkbook: (workbook: WorkbookData, meta?: { fileName?: string; warnings?: string[] }) => void
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
  sendMessage: () => Promise<void>
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
  // Approval proof stays in memory, outside model params and persisted chat.
  const preparedScripts = new Map<string, { scope: import('@/types').ActionScope; paramsKey: string; mutations: SandboxSuccess }>()
  const currentScope = () => {
    const s = get()
    return captureActionScope(s.workbook, s.activeSheetId, s.selection, s.additionalSelections)
  }
  const findAction = (id: string) => get().messages.flatMap(m => m.actions ?? []).find(a => a.id === id)
  const setActionStatus = (id: string, status: import('@/types').AgentAction['status']) => set(s => {
    const action = s.messages.flatMap(m => m.actions ?? []).find(a => a.id === id)
    if (action) action.status = status
  })
  const failAction = (id: string, content: string) => {
    if (!findAction(id)) return
    preparedScripts.delete(id)
    setActionStatus(id, 'rejected')
    set(s => { s.messages.push({ id: uuid(), role: 'assistant', content: `⚠️ ${content}`, timestamp: Date.now() }) })
  }
  const staleMessage = 'The workbook, sheet, or selection changed after the preview/request. Nothing was applied. Please ask again to review the current data.'
  return {
    setChatInput: (val) => set((s) => { s.chatInput = val }),

    addMessage: (msg) => {
      const scoped = bindMessageActions(msg, currentScope())
      set((s) => { s.messages.push(scoped) })
    },

    clearChat: () => set((s) => {
      preparedScripts.clear()
      s.messages = [createWelcomeMessage()]
      s.chatInput = ''
      s.isAiProcessing = false
    }),

    togglePinMessage: (messageId) => set((s) => {
      const msg = s.messages.find((m) => m.id === messageId)
      if (msg) msg.pinned = !msg.pinned
    }),

    // Allocates a fresh array each call. NEVER call this inside a Zustand
    // selector body (e.g. useStore((s) => s.getPinnedMessages())) — the new
    // reference fails Object.is every render and causes an infinite re-render
    // loop (React error #185). Select the function reference and call it in
    // an effect/handler, or wrap the result with useShallow.
    getPinnedMessages: () => get().messages.filter((m) => m.pinned),

    sendMessage: () => {
      if (get().isAiProcessing) return Promise.resolve()
      let input = get().chatInput.trim()
      if (!input) return Promise.resolve()

      let skipCapabilityRouter = false
      let resolvedCapabilityId: string | undefined
      // Strip capability-skip / pick encoding so the bubble shows NL only.
      if (isCapabilitySkipMessage(input)) {
        skipCapabilityRouter = true
        input = stripCapabilitySkipPrefix(input).trim()
        if (!input) return Promise.resolve()
      } else {
        const pick = parseCapabilityPickMessage(input)
        if (pick) {
          resolvedCapabilityId = pick.capabilityId
          input = pick.label
        }
      }

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

      return import('@/services/chatService').then(({ processChatMessage }) =>
        processChatMessage(input, streamingMsgId, {
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
          getAdditionalSelections: () => get().additionalSelections,
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
          skipCapabilityRouter,
          resolvedCapabilityId,
        })
      )
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
      get().importWorkbook(preview.workbook, {
        fileName: preview.fileName,
        warnings: preview.importWarnings,
      })
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
      const action = findAction(actionId)
      if (!action || action.status !== 'pending') return
      if (!actionScopeMatches(action.scope, currentScope())) {
        failAction(actionId, staleMessage)
        return
      }

      if (action.tool === 'execute_script') {
        const paramsKey = JSON.stringify(action.params)
        const prepared = preparedScripts.get(actionId)
        if (prepared) {
          if (prepared.paramsKey !== paramsKey || !actionScopeMatches(prepared.scope, currentScope())) {
            failAction(actionId, staleMessage)
            return
          }
          // Lock and consume before committing. A repeated click cannot replay.
          setActionStatus(actionId, 'applying')
          preparedScripts.delete(actionId)
          const result = applyPreparedScript(
            prepared.mutations,
            `AI Action: ${action.description}`,
            get as never,
            set as never,
          )
          if (result.success) setActionStatus(actionId, 'applied')
          else failAction(actionId, result.message)
          return
        }

        const code = action.params.code
        if (typeof code !== 'string' || !code.trim()) {
          failAction(actionId, 'execute_script requires a non-empty string code parameter.')
          return
        }

        const scope = action.scope
        const sheet = get().getActiveSheet()
        const paramsSnapshot = JSON.stringify(action.params)
        // Snapshot computed results up front; preparation must be deterministic
        // even if formula-engine initialization yields to the event loop.
        const values = new Map<string, string>()
        for (const cellId of Object.keys(sheet.cells)) {
          const { row, col } = cellToRef(cellId)
          values.set(cellId, get().getComputedValue(row, col))
        }
        setActionStatus(actionId, 'previewing')
        set(s => {
          const current = s.messages.flatMap(m => m.actions ?? []).find(a => a.id === actionId)
          if (current) delete current.preview
        })

        void buildScriptPreview(code, {
          sheet,
          getComputedValue: (row, col) => values.get(refToCell(row, col)) ?? '',
        }).then(preview => {
          const latest = findAction(actionId)
          // Clearing/rejecting while preparation is pending must not resurrect it.
          if (!latest || latest.status !== 'previewing') return
          if (!scope || !actionScopeMatches(scope, currentScope()) || JSON.stringify(latest.params) !== paramsSnapshot) {
            failAction(actionId, staleMessage)
            return
          }
          if (!preview.success || !preview.mutations) {
            failAction(actionId, `The script could not be reviewed: ${preview.error ?? 'unknown error'}`)
            return
          }
          preparedScripts.set(actionId, { scope, paramsKey: paramsSnapshot, mutations: preview.mutations })
          set(s => {
            const current = s.messages.flatMap(m => m.actions ?? []).find(a => a.id === actionId)
            if (!current) return
            current.preview = { changes: preview.changes ?? [] }
            current.status = 'pending'
            const base = current.description.replace(/ \(about \d+ changes\)$/, '')
            current.description = base + (current.preview.changes.length ? ` (about ${current.preview.changes.length} changes)` : '')
          })
        }).catch(err => {
          if (findAction(actionId)?.status === 'previewing') {
            failAction(actionId, err instanceof Error ? err.message : 'The script could not be reviewed.')
          }
        })
        return
      }

      const highImpactTools = new Set(['clear_sheet', 'clean_sheet_data', 'delete_row', 'modify_column', 'apply_formula', 'style_recipe'])
      if (highImpactTools.has(action.tool) && !action.preview) {
        recordTelemetry('previewDeniedActions', action.tool)
        failAction(actionId, `I need to show a preview before applying **${action.tool}**. Ask me to regenerate the action.`)
        return
      }

      const estimatedChanges = estimateActionChangeCount(action)
      const historyLabel = `AI Action: ${action.description}${estimatedChanges > 0 ? ` (~${estimatedChanges} changes)` : ''}`
      setActionStatus(actionId, 'applying')
      if (action.tool !== 'execute_macro') get().pushHistory(historyLabel)
      const finishAction = (result: ExecutionResult) => {
        if (result.success) setActionStatus(actionId, 'applied')
        else failAction(actionId, result.message)
      }
      const confirmedAction = action.tool === 'apply_formula' && action.preview
        ? { ...action, params: { ...action.params, confirmGaps: true } }
        : action
      try {
        const execution = executeAction(confirmedAction, get as never, set as never)
        if (execution instanceof Promise) {
          void execution.then(finishAction).catch(err => failAction(actionId,
            err instanceof Error ? err.message : 'The action failed unexpectedly.'))
        } else finishAction(execution)
      } catch (err) {
        failAction(actionId, err instanceof Error ? err.message : 'The action failed unexpectedly.')
      }
    },

    rejectAction: (actionId) => {
      preparedScripts.delete(actionId)
      const action = findAction(actionId)
      if (!action || (action.status !== 'pending' && action.status !== 'previewing')) return
      setActionStatus(actionId, 'rejected')
    },
  }
}
