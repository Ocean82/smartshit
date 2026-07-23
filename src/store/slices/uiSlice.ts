/**
 * UI Slice — panel visibility, dialog state, scroll position, toasts, and confirmations.
 *
 * These are purely UI concerns that don't affect workbook data or AI processing.
 * Extracted from the monolithic store to improve organization and reduce re-renders
 * (components selecting only UI state won't re-render on workbook mutations).
 */

import type { Toast, ConfirmDialogState } from '@/types'
import { v4 as uuid } from 'uuid'

export interface UIState {
  // Panel/dialog visibility
  showChat: boolean
  chatWidth: number
  showFileExplorer: boolean
  showSkills: boolean
  showChartDialog: boolean
  showFormatPanel: boolean
  showToolbar: boolean
  showVersionHistory: boolean
  showValidationDialog: boolean
  showPivotDialog: boolean
  showFilterDialog: boolean
  showConditionalFormatDialog: boolean
  contextMenu: { x: number; y: number; cell: string } | null

  // Panel system (right-side dock)
  activePanel: 'chat' | 'insights' | 'auditor' | 'inspector' | null
  panelWidths: Record<string, number>

  // Scroll
  scrollRow: number
  scrollCol: number

  // Toast notifications
  toasts: Toast[]

  // Confirmation dialog
  confirmDialog: ConfirmDialogState | null
}

export interface UIActions {
  setShowPivotDialog: (show: boolean) => void
  setShowFilterDialog: (v: boolean) => void
  setShowConditionalFormatDialog: (v: boolean) => void
  setActivePanel: (panel: 'chat' | 'insights' | 'auditor' | 'inspector' | null) => void
  setPanelWidth: (panel: string, width: number) => void
  toggleChat: () => void
  setShowChat: (v: boolean) => void
  setChatWidth: (w: number) => void
  toggleFileExplorer: () => void
  toggleSkills: () => void
  setShowChartDialog: (v: boolean) => void
  setShowFormatPanel: (v: boolean) => void
  setShowToolbar: (v: boolean) => void
  toggleToolbar: () => void
  setShowVersionHistory: (v: boolean) => void
  setShowValidationDialog: (show: boolean) => void
  setContextMenu: (menu: { x: number; y: number; cell: string } | null) => void
  setScrollPosition: (row: number, col: number) => void
  showToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  showConfirm: (dialog: ConfirmDialogState) => void
  dismissConfirm: () => void
}

/**
 * Create the initial UI state from localStorage (if available).
 */
export function createUIState(): UIState {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null
  const storedChatWidth = Number(storage?.getItem('smartsht-chat-width') || 380)
  const initialChatWidth = Number.isFinite(storedChatWidth)
    ? Math.min(720, Math.max(280, storedChatWidth))
    : 380
  const storedShowChat = storage?.getItem('smartsht-show-chat') ?? null
  const initialShowChat = storedShowChat === null ? true : storedShowChat !== '0'

  return {
    showChat: initialShowChat,
    chatWidth: initialChatWidth,
    showFileExplorer: false,
    showSkills: false,
    showChartDialog: false,
    showFormatPanel: false,
    showToolbar: storage?.getItem('smartsht-show-toolbar') !== '0',
    showVersionHistory: false,
    showValidationDialog: false,
    showPivotDialog: false,
    showFilterDialog: false,
    showConditionalFormatDialog: false,
    contextMenu: null,
    activePanel: null,
    panelWidths: JSON.parse(storage?.getItem('smartsht-panel-widths') || '{}'),
    scrollRow: 0,
    scrollCol: 0,
    toasts: [],
    confirmDialog: null,
  }
}

/**
 * Create UI actions. Takes the immer `set` function from Zustand.
 */
export function createUIActions(
  set: (fn: (s: UIState) => void) => void,
  get: () => UIState,
): UIActions {
  const storage = typeof localStorage !== 'undefined' ? localStorage : null

  return {
    setShowPivotDialog: (show) => set((s) => { s.showPivotDialog = show }),
    setShowFilterDialog: (v) => set((s) => { s.showFilterDialog = v }),
    setShowConditionalFormatDialog: (v) => set((s) => { s.showConditionalFormatDialog = v }),
    setActivePanel: (panel) => set((s) => { s.activePanel = panel }),
    setPanelWidth: (panel, width) => {
      set((s) => { s.panelWidths[panel] = width })
      try {
        const current = JSON.parse(storage?.getItem('smartsht-panel-widths') || '{}')
        current[panel] = width
        storage?.setItem('smartsht-panel-widths', JSON.stringify(current))
      } catch { /* ignore */ }
    },
    toggleChat: () => set((s) => {
      s.showChat = !s.showChat
      try { localStorage.setItem('smartsht-show-chat', s.showChat ? '1' : '0') } catch { /* ignore */ }
    }),
    setShowChat: (v) => set((s) => {
      s.showChat = v
      try { localStorage.setItem('smartsht-show-chat', v ? '1' : '0') } catch { /* ignore */ }
    }),
    setChatWidth: (w) => set((s) => {
      const clamped = Math.min(720, Math.max(280, Math.round(w)))
      s.chatWidth = clamped
      try { localStorage.setItem('smartsht-chat-width', String(clamped)) } catch { /* ignore */ }
    }),
    toggleFileExplorer: () => set((s) => { s.showFileExplorer = !s.showFileExplorer }),
    toggleSkills: () => set((s) => { s.showSkills = !s.showSkills }),
    setShowChartDialog: (v) => set((s) => { s.showChartDialog = v }),
    setShowFormatPanel: (v) => set((s) => { s.showFormatPanel = v }),
    setShowToolbar: (v) => {
      set((s) => { s.showToolbar = v })
      storage?.setItem('smartsht-show-toolbar', v ? '1' : '0')
    },
    toggleToolbar: () => {
      // Need to read current value — use get()
      const next = !get().showToolbar
      set((s) => { s.showToolbar = next })
      storage?.setItem('smartsht-show-toolbar', next ? '1' : '0')
    },
    setShowVersionHistory: (v) => set((s) => { s.showVersionHistory = v }),
    setShowValidationDialog: (show) => set((s) => { s.showValidationDialog = show }),
    setContextMenu: (menu) => set((s) => { s.contextMenu = menu }),
    setScrollPosition: (row, col) => set((s) => { s.scrollRow = row; s.scrollCol = col }),
    showToast: (toast) => {
      const id = uuid()
      set((s) => {
        s.toasts.push({ ...toast, id })
        if (s.toasts.length > 5) {
          s.toasts = s.toasts.slice(-5)
        }
      })
    },
    dismissToast: (id) => set((s) => { s.toasts = s.toasts.filter((t) => t.id !== id) }),
    showConfirm: (dialog) => set((s) => { s.confirmDialog = dialog }),
    dismissConfirm: () => set((s) => { s.confirmDialog = null }),
  }
}
