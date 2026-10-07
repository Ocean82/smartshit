/**
 * Chat slice — messages, AI send/apply flow, attachments, templates.
 */

import type { ChatMessage, Skill, WorkbookData, Selection, SheetData, ActionStatus } from '@/types'
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
import { scriptPatchSignature } from '@/lib/scriptPatch'
import { captureActionScope, validateActionScope } from '@/lib/actionScope'
import { v4 as uuid } from 'uuid'
import {
  processAICommand,
  estimateActionChangeCount,
  buildExecutionContext,
  executeAction,
  applyPreparedScriptAction,
} from '../aiExecution'

export const DEFAULT_WELCOME_CONTENT =
  `Welcome to **smartsh!t** — your budgeting copilot.\n\nStart by importing a spreadsheet, then ask:\n- *"Explain this spreadsheet I just loaded"*\n- *"Where am I overspending?"*\n- *"What should I cut first to save more?"*\n\nI only apply major changes after you review and approve them.`

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

/**
 * Actions currently being previewed or applied. The status flip happens
 * synchronously in the store, but an in-flight promise can still be resolved by
 * a stale click handler, so the id set is checked too. Prevents a double Apply
 * from executing a script (or any async action) twice.
 */
const inFlightActions = new Set<string>()

/**
 * Identity of the newest chat turn. Incremented by `sendMessage` and by
 * `clearChat` so abandoned work cannot write into a newer turn.
 */
let activeTurnId = 0

/** Cancels the in-flight turn's server call (Stop button / clear chat). */
let activeTurnAbort: AbortController | null = null

/** Dependencies chat actions need from the composed store. */
export interface ChatStoreAccess extends ChatState {
  workbook: WorkbookData
  engine: SpreadsheetEngine
  selection: Selection | null
  activeSheetId: string
  /** Monotonic workbook revision used to stale-check pending actions. */
  workbookRevision: number
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
  stopAiResponse: () => void
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

    clearChat: () => {
      // Abandon any in-flight turn: its late tokens must not reappear and its
      // completion must not clear the processing flag of a newer turn.
      activeTurnId += 1
      activeTurnAbort?.abort()
      inFlightActions.clear()
      set((s) => {
        s.messages = [createWelcomeMessage()]
        s.chatInput = ''
        s.isAiProcessing = false
      })
    },

    stopAiResponse: () => activeTurnAbort?.abort(),

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
      // Serialize turns at the store boundary. The Send button is disabled
      // while processing, but the textarea stays enabled and Enter reaches
      // this action directly — a second concurrent turn would interleave
      // placeholders, streamed tokens and the processing flag.
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

      // Turn identity: clearing the chat (or a reload) invalidates this turn so
      // a late token/finalize from abandoned work cannot resurrect it or reset
      // the processing flag for a newer turn.
      const turnId = ++activeTurnId
      const isCurrentTurn = () => turnId === activeTurnId
      const turnAbort = new AbortController()
      activeTurnAbort = turnAbort

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
          getActiveSheetId: () => get().activeSheetId,
          getWorkbookRevision: () => get().workbookRevision,
          getAttachedPreview: () => get().attachedFilePreview,
          getMessages: () => get().messages,
          setActiveSheet: (sheetId) => set((s) => { s.activeSheetId = sheetId }),
          pushHistory: (desc) => get().pushHistory(desc),
          buildExecContext: (opts) => buildExecutionContext(get as never, set as never, opts),
          appendToken: (msgId, token) => {
            if (!isCurrentTurn()) return
            set((s) => {
              const msg = s.messages.find((m) => m.id === msgId)
              if (msg) msg.content += token
            })
          },
          finalizeMessage: (msgId, msg) => {
            if (!isCurrentTurn()) return
            set((s) => {
              const idx = s.messages.findIndex((m) => m.id === msgId)
              if (idx >= 0) s.messages[idx] = msg
            })
          },
          setProcessing: (v) => {
            if (!isCurrentTurn()) return
            set((s) => { s.isAiProcessing = v })
          },
          processLocalFallback: (fallbackInput) => processAICommand(fallbackInput, get as never),
          skipCapabilityRouter,
          resolvedCapabilityId,
          signal: turnAbort.signal,
        })
      ).finally(() => {
        if (activeTurnAbort === turnAbort) activeTurnAbort = null
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
      const state = get()
      const highImpactTools = new Set([
        'clear_sheet',
        'clean_sheet_data',
        'delete_row',
        'modify_column',
        'apply_formula',
        'execute_script',
        'style_recipe',
      ])

      const markActionStatus = (id: string, status: ActionStatus) => {
        set((s) => {
          for (const m of s.messages) {
            if (!m.actions) continue
            const target = m.actions.find((act) => act.id === id)
            if (target) target.status = status
          }
        })
      }

      const pushAssistant = (content: string) => {
        set((s) => {
          s.messages.push({
            id: uuid(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
          })
        })
      }

      const storedStatus = (id: string): ActionStatus | undefined => {
        for (const m of get().messages) {
          const target = m.actions?.find((act) => act.id === id)
          if (target) return target.status
        }
        return undefined
      }

      for (const msg of state.messages) {
        if (!msg.actions) continue
        const action = msg.actions.find((a) => a.id === actionId)
        if (!action) continue

        // ─── Duplicate-Apply guard ───────────────────────────────────────────
        // An action is actionable only while pending. The status flips to
        // `previewing`/`applying` synchronously below (before any await), so a
        // second click — or a click landing while an async run is in flight —
        // can never execute the same action twice.
        if (action.status !== 'pending' || inFlightActions.has(actionId)) return

        // ─── Scope binding ──────────────────────────────────────────────────
        // A proposal is a promise about one workbook/sheet/selection/revision.
        // If any of those moved since it was prepared, applying it would write
        // the right patch into the wrong place — so reject it instead.
        const scopeCheck = validateActionScope(action, captureActionScope(get() as never))
        if (!scopeCheck.ok) {
          markActionStatus(actionId, 'stale')
          recordTelemetry('previewDeniedActions', `${action.tool}:stale`)
          pushAssistant(
            `⚠️ I did not apply **${action.tool}** because ${scopeCheck.reason}. ` +
            'Nothing was changed — ask me again and I will re-check the current data.',
          )
          return
        }

        // execute_script is the most powerful (and least predictable) tool —
        // its side effects cannot be statically predicted. Before it can be
        // applied we must run a collect-only dry-run and show the exact
        // changes for approval. This mirrors the real sandbox so the preview
        // reflects precisely what would be written to the sheet, and the
        // collected patch is what Apply later commits verbatim.
        if (action.tool === 'execute_script' && !action.prepared) {
          const code = String(action.params.code ?? '')
          if (!code.trim()) {
            recordTelemetry('previewDeniedActions', action.tool)
            pushAssistant('⚠️ execute_script requires a non-empty `code` parameter before it can run.')
            return
          }
          markActionStatus(actionId, 'previewing')
          inFlightActions.add(actionId)
          buildScriptPreview(code, {
            sheet: get().getActiveSheet(),
            getComputedValue: get().getComputedValue,
          }).then((preview) => {
            inFlightActions.delete(actionId)
            if (!preview.success) {
              markActionStatus(actionId, 'rejected')
              pushAssistant(`⚠️ The script could not be reviewed: ${preview.error ?? 'unknown error'}`)
              return
            }
            // The user may have rejected while the dry-run was in flight — do
            // not resurrect the action with a fresh preview.
            if (storedStatus(actionId) !== 'previewing') return
            set((s) => {
              for (const m of s.messages) {
                if (!m.actions) continue
                const target = m.actions.find((act) => act.id === actionId)
                if (!target) continue
                const changes = preview.changes ?? []
                target.preview = { changes }
                target.prepared = preview.patch
                  ? { kind: 'script', patch: preview.patch, signature: scriptPatchSignature(preview.patch) }
                  : undefined
                const changeLabel = changes.length ? ` (about ${changes.length} changes)` : ''
                target.description = `${target.description.replace(/ \(about \d+ changes\)$/, '')}${changeLabel}`
                target.status = 'pending'
              }
            })
          }).catch((err) => {
            inFlightActions.delete(actionId)
            markActionStatus(actionId, 'failed')
            pushAssistant(`⚠️ The script could not be reviewed: ${err instanceof Error ? err.message : 'unknown error'}`)
          })
          return
        }

        const estimatedChanges = estimateActionChangeCount(action)
        const requiresPreview = highImpactTools.has(action.tool) && !action.preview
        if (requiresPreview) {
          recordTelemetry('previewDeniedActions', action.tool)
          pushAssistant(`I need to show a preview before applying **${action.tool}** because it can affect many cells. Ask me to regenerate this action with a preview.`)
          return
        }

        // Reviewed script patches carry their own history entry (an explicit
        // before/after diff) and their own rollback, so they must not also go
        // through pushHistory()'s microtask diff.
        const ownsHistory = action.prepared?.kind === 'script' || action.tool === 'execute_macro'
        if (!ownsHistory) {
          const historyLabel = estimatedChanges > 0
            ? `AI Action: ${action.description} (~${estimatedChanges} changes)`
            : `AI Action: ${action.description}`
          get().pushHistory(historyLabel)
        }

        const finishAction = (result: ExecutionResult) => {
          inFlightActions.delete(actionId)
          // A Reject that landed mid-flight wins: the badge must not flip back
          // to Applied when the work it cancelled completes anyway.
          if (storedStatus(actionId) === 'rejected') {
            if (!result.success) pushAssistant(`⚠️ ${result.message}`)
            return
          }
          markActionStatus(actionId, result.success ? 'applied' : 'failed')
          if (!result.success) {
            pushAssistant(`⚠️ ${result.message}`)
          }
        }

        markActionStatus(actionId, 'applying')
        inFlightActions.add(actionId)

        // An explicit Apply after a preview was shown is the user's confirmation.
        // apply_formula blocks on range-gap risk unless confirmGaps is set, so an
        // action the user has reviewed and approved must carry that override —
        // otherwise the reviewed formula is silently rejected on Apply. The
        // warning is rendered in the ActionCard, so the click is informed.
        const confirmedAction = action.tool === 'apply_formula' && action.preview
          ? { ...action, params: { ...action.params, confirmGaps: true } }
          : action

        const execution = action.prepared?.kind === 'script'
          ? applyPreparedScriptAction(action, get as never, set as never)
          : executeAction(confirmedAction, get as never, set as never)

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
        return
      }
    },

    rejectAction: (actionId) => {
      inFlightActions.delete(actionId)
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
