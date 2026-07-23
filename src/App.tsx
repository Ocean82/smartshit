import { useEffect, useState, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { fetchServerHealth, type ServerHealth } from '@/ai/agentClient'
import { Toolbar } from '@/components/Toolbar'
import { SpreadsheetGrid } from '@/components/SpreadsheetGrid'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ChatPanel } from '@/components/ChatPanel'
import { SheetTabs } from '@/components/SheetTabs'
import { FileExplorer } from '@/components/FileExplorer'
import { ContextMenu } from '@/components/ContextMenu'
import { ChartDialog } from '@/components/ChartDialog'
import { ChartOverlay } from '@/components/ChartRenderer'
import { ValidationDialog } from '@/components/ValidationDialog'
import { PivotDialog } from '@/components/PivotDialog'
import { FormatPanel } from '@/components/FormatPanel'
import { FilterDialog } from '@/components/FilterDialog'
import { ConditionalFormatDialog } from '@/components/ConditionalFormatDialog'
import { StatusBar } from '@/components/StatusBar'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'
import { TemplateGallery } from '@/components/TemplateGallery'
import { CommandPalette } from '@/components/CommandPalette'
import { MenuBar } from '@/components/MenuBar'
import { MobileToolbar } from '@/components/MobileToolbar'
import { MobileMenu } from '@/components/MobileMenu'
import { TelemetryDebugPanel } from '@/components/TelemetryDebugPanel'
import { WorkbookPicker } from '@/components/WorkbookPicker'
import { VersionHistoryPanel } from '@/components/VersionHistoryPanel'
import { PanelRail, DockPanel, AuditPanelContent, InsightsPanelContent, InspectorPanelContent } from '@/components/panels'
import { ShareDialog } from '@/components/ShareDialog'
import { FormulaBar } from '@/components/FormulaBar'
import { GoToCellDialog } from '@/components/GoToCellDialog'
import { ToastContainer } from '@/components/Toast'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyGridGuide } from '@/components/EmptyGridGuide'
import { Sparkles, Zap, Cloud, CloudOff, Loader2, Share2, MessageSquare, SquarePen, Search } from 'lucide-react'
import { UserNav } from '@/auth'
import {
  getSyncStatus,
  onSyncStatusChange,
  scheduleSave,
  isCloudConfigured,
  type SyncStatus,
} from '@/lib/cloudSync'
import { exportWorkbookToJson, importWorkbookFromJsonFile, normalizeImportedWorkbook } from '@/io/workbookJson'
import { exportWorkbookToXlsx } from '@/io/xlsx'
import { refToCell } from '@/engine/spreadsheet'

function App() {
  const {
    workbook,
    engine,
    showValidationDialog,
    setShowValidationDialog,
    showPivotDialog,
    setShowPivotDialog,
    showFilterDialog,
    setShowFilterDialog,
    showConditionalFormatDialog,
    setShowConditionalFormatDialog,
    setActivePanel,
    showToolbar,
    toggleToolbar,
  } = useStore()
  const [isLoaded, setIsLoaded] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showWorkbookPicker, setShowWorkbookPicker] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showGoToCell, setShowGoToCell] = useState(false)
  const jsonRestoreInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    engine.loadWorkbook(workbook)
    setIsLoaded(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cloud sync: schedule a save whenever workbook updates
  useEffect(() => {
    if (isLoaded && isCloudConfigured()) {
      scheduleSave(workbook)
    }
  }, [workbook.updatedAt, isLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for share dialog open event from MenuBar
  useEffect(() => {
    const handler = () => setShowShareDialog(true)
    document.addEventListener('smartsht:open-share', handler)
    return () => document.removeEventListener('smartsht:open-share', handler)
  }, [])

  // Ctrl/Cmd+K opens the command palette, ESC closes panels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandPalette(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setShowGoToCell(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        toggleToolbar()
      }
      // Ctrl+S: Save as Excel
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        exportWorkbookToXlsx(useStore.getState().workbook)
        useStore.getState().showToast({ type: 'success', message: 'Saved as Excel' })
      }
      // Ctrl+O: Open file
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('input[accept=".csv,.xlsx,.xls"]')?.click()
      }
      // Ctrl+B/I/U: Text formatting (only when not editing a cell)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        const state = useStore.getState()
        if (state.selection && !state.editingCell) {
          e.preventDefault()
          const cellId = refToCell(state.selection.startRow, state.selection.startCol)
          const cell = state.getActiveSheet().cells[cellId]
          state.setRangeFormat({ bold: !cell?.format?.bold })
        }
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'i') {
        const state = useStore.getState()
        if (state.selection && !state.editingCell) {
          e.preventDefault()
          const cellId = refToCell(state.selection.startRow, state.selection.startCol)
          const cell = state.getActiveSheet().cells[cellId]
          state.setRangeFormat({ italic: !cell?.format?.italic })
        }
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'u') {
        const state = useStore.getState()
        if (state.selection && !state.editingCell) {
          e.preventDefault()
          const cellId = refToCell(state.selection.startRow, state.selection.startCol)
          const cell = state.getActiveSheet().cells[cellId]
          state.setRangeFormat({ underline: !cell?.format?.underline })
        }
      }
      if (e.key === 'Escape' && useStore.getState().activePanel) {
        setActivePanel(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: 'var(--surface-body)' }}>
        <div className="flex flex-col items-center gap-4">
          <img src="/smartsht-favicon.PNG" alt="smartsh!t" className="w-14 h-14 rounded-2xl shadow-md" />
          <div className="text-sm animate-pulse font-medium" style={{ color: 'var(--ink-secondary)' }}>Loading smartsh!t...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      {/* Skip to main content — keyboard a11y */}
      <a
        href="#spreadsheet-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:rounded-lg"
        style={{ background: 'var(--accent-600)', color: 'white' }}
      >
        Skip to spreadsheet
      </a>
      <TitleBar
        onOpenTemplates={() => setShowTemplates(true)}
        onOpenCloudPicker={() => setShowWorkbookPicker(true)}
        onOpenShare={() => setShowShareDialog(true)}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
      />
      {/* Desktop-only: toolbar (hideable via Ctrl+Shift+T) */}
      {showToolbar && (
        <div className="hidden md:block">
          <Toolbar />
        </div>
      )}
      <FormulaBar />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <FileExplorer />

        {/* Spreadsheet — always takes remaining space */}
        <div id="spreadsheet-main" className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          <div className="flex-1 flex flex-col overflow-hidden relative pb-[52px] md:pb-0">
            <ErrorBoundary scope="Spreadsheet Grid">
              <SpreadsheetGrid />
            </ErrorBoundary>
            <ChartOverlay />
            <EmptyGridGuide onOpenTemplates={() => setShowTemplates(true)} />
          </div>
          <SheetTabs />
        </div>

        {/* Right-side panel system */}
        <DockPanel panelId="chat" title="Chat" headerActions={<ChatDockActions />}>
          <ChatPanel embedded />
        </DockPanel>
        <DockPanel panelId="insights" title="Insights">
          <InsightsPanelContent />
        </DockPanel>
        <DockPanel panelId="auditor" title="Auditor">
          <AuditPanelContent />
        </DockPanel>
        <DockPanel panelId="inspector" title="Inspector">
          <InspectorPanelContent />
        </DockPanel>

        <FormatPanel />
        <VersionHistoryPanel />

        {/* Panel rail — rightmost edge (desktop only) */}
        <div className="hidden md:flex">
          <PanelRail />
        </div>
      </div>

      {/* Mobile bottom toolbar */}
      <MobileToolbar />

      {/* Mobile chat toggle FAB */}
      <button
        type="button"
        onClick={() => setActivePanel('chat')}
        className="md:hidden fixed bottom-16 right-4 z-30 p-3.5 rounded-full text-white shadow-lg transition-colors active:scale-95"
        style={{ background: 'var(--accent-600)' }}
        aria-label="Open chat"
      >
        <MessageSquare size={22} />
      </button>

      <StatusBar />
      <ContextMenu />
      <ChartDialog />
      <ValidationDialog isOpen={showValidationDialog} onClose={() => setShowValidationDialog(false)} />
      <PivotDialog isOpen={showPivotDialog} onClose={() => setShowPivotDialog(false)} />
      <FilterDialog isOpen={showFilterDialog} onClose={() => setShowFilterDialog(false)} />
      <ConditionalFormatDialog isOpen={showConditionalFormatDialog} onClose={() => setShowConditionalFormatDialog(false)} />
      <WelcomeOverlay onOpenTemplates={() => setShowTemplates(true)} />
      <TemplateGallery open={showTemplates} onClose={() => setShowTemplates(false)} />
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onOpenTemplates={() => setShowTemplates(true)}
        onFocusChat={() => {
          setActivePanel('chat')
          window.setTimeout(() => {
            document.dispatchEvent(new Event('smartsht:focus-chat'))
          }, 50)
        }}
        onExportJson={() => exportWorkbookToJson(workbook)}
        onImportJson={() => jsonRestoreInputRef.current?.click()}
      />
      <input
        ref={jsonRestoreInputRef}
        type="file"
        accept=".json,.smartsht.json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          try {
            const wb = normalizeImportedWorkbook(await importWorkbookFromJsonFile(file))
            useStore.getState().pushHistory('Restore JSON backup')
            useStore.getState().loadWorkbookData(wb)
          } catch {
            /* ignore — user can retry from File menu for messaging */
          }
          e.target.value = ''
        }}
      />
      <WorkbookPicker open={showWorkbookPicker} onClose={() => setShowWorkbookPicker(false)} />
      <ShareDialog open={showShareDialog} onClose={() => setShowShareDialog(false)} />
      <GoToCellDialog open={showGoToCell} onClose={() => setShowGoToCell(false)} />
      {import.meta.env.DEV ? <TelemetryDebugPanel /> : null}
      <ToastContainer />
      <ConfirmDialog />
    </div>
  )
}

function TitleBar({ onOpenTemplates, onOpenCloudPicker, onOpenShare, onOpenCommandPalette }: { onOpenTemplates: () => void; onOpenCloudPicker: () => void; onOpenShare: () => void; onOpenCommandPalette: () => void }) {
  const { workbook } = useStore()
  const [health, setHealth] = useState<ServerHealth | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    void fetchServerHealth().then(setHealth)
    const id = setInterval(() => { void fetchServerHealth().then(setHealth) }, 15000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    return onSyncStatusChange(setSyncStatus)
  }, [])

  const aiLabel = health?.ok ? 'AI online' : health?.ollama ? 'Model loading' : 'AI offline'
  const aiColor = health?.ok ? 'var(--success)' : 'var(--warning)'

  // Cloud sync badge
  const syncBadge = (() => {
    if (!isCloudConfigured()) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
          <Zap size={11} style={{ color: 'var(--success)' }} />
          <span style={{ color: 'var(--neutral-300)' }}>Local</span>
        </div>
      )
    }
    switch (syncStatus) {
      case 'syncing':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
            <Loader2 size={11} className="animate-spin" style={{ color: 'var(--info)' }} />
            <span style={{ color: 'var(--info)' }}>Syncing</span>
          </div>
        )
      case 'saved':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
            <Cloud size={11} style={{ color: 'var(--success)' }} />
            <span style={{ color: 'var(--success)' }}>Saved</span>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
            <CloudOff size={11} style={{ color: 'var(--error)' }} />
            <span style={{ color: 'var(--error)' }}>Error</span>
          </div>
        )
      case 'offline':
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
            <CloudOff size={11} style={{ color: 'var(--warning)' }} />
            <span style={{ color: 'var(--warning)' }}>Offline</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
            <Cloud size={11} style={{ color: 'var(--neutral-400)' }} />
            <span style={{ color: 'var(--neutral-300)' }}>Cloud</span>
          </div>
        )
    }
  })()

  return (
    <div className="h-10 flex items-center px-2 md:px-4 gap-2 md:gap-3 shrink-0" style={{ background: 'var(--surface-chrome)' }}>
      {/* Mobile hamburger menu */}
      <MobileMenu />

      <div className="flex items-center gap-2">
        <img src="/smartsht-favicon.PNG" alt="smartsh!t" className="w-6 h-6 rounded-lg" />
        <span className="text-sm font-semibold tracking-tight hidden sm:inline" style={{ color: 'var(--ink-on-dark)' }}>smartsh!t</span>
      </div>

      <div className="w-px h-4 hidden md:block" style={{ background: 'var(--neutral-800)' }} />

      {/* Integrated menu bar — desktop only */}
      <div className="hidden md:block">
        <MenuBar />
      </div>

      <div className="w-px h-4 hidden md:block" style={{ background: 'var(--neutral-800)' }} />

      <span className="text-xs truncate max-w-[120px] md:max-w-[200px]" style={{ color: 'var(--neutral-400)' }}>{workbook.name}</span>

      <div className="flex-1" />

      <div className="flex items-center gap-2 md:gap-2.5 text-[11px]" style={{ color: 'var(--neutral-400)' }}>
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="hidden md:inline-flex px-2 py-1 rounded-md transition-colors items-center gap-1.5 hover:text-white"
          style={{ background: 'var(--neutral-900)', color: 'var(--neutral-300)' }}
          title="Command Palette (Ctrl+K)"
        >
          <Search size={11} />
          <span>Ctrl+K</span>
        </button>

        <button
          type="button"
          onClick={onOpenTemplates}
          className="hidden md:inline-flex px-2 py-1 rounded-md transition-colors hover:text-white"
          style={{ background: 'var(--neutral-900)', color: 'var(--neutral-300)' }}
        >
          Templates
        </button>

        <button
          type="button"
          onClick={onOpenCloudPicker}
          className="hidden md:inline-flex px-2 py-1 rounded-md transition-colors items-center gap-1 hover:text-white"
          style={{ background: 'var(--neutral-900)', color: 'var(--neutral-300)' }}
        >
          <Cloud size={11} />
          Cloud
        </button>

        <button
          type="button"
          onClick={onOpenShare}
          className="hidden md:inline-flex px-2 py-1 rounded-md transition-colors items-center gap-1 hover:text-white"
          style={{ background: 'var(--neutral-900)', color: 'var(--neutral-300)' }}
        >
          <Share2 size={11} />
          Share
        </button>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--neutral-900)' }}>
          <Sparkles size={11} style={{ color: 'var(--warning)' }} />
          <span className="hidden sm:inline" style={{ color: aiColor }}>{aiLabel}</span>
          <span className="sm:hidden" style={{ color: aiColor }}>{health?.ok ? '●' : '○'}</span>
        </div>
        <span className="hidden md:inline">{syncBadge}</span>
        <span className="hidden sm:inline text-[10px]" style={{ color: 'var(--neutral-500)' }}>
          {new Date(workbook.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <UserNav />
      </div>
    </div>
  )
}

function ChatDockActions() {
  const { messages, clearChat } = useStore()
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClear = () => {
    if (messages.length <= 2) {
      clearChat()
      return
    }
    if (confirmClear) {
      clearChat()
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 3000)
    }
  }

  if (messages.length <= 1) return null

  return (
    <button
      type="button"
      onClick={handleClear}
      className={`p-1 rounded transition-colors ${
        confirmClear
          ? 'bg-red-100 text-red-600 hover:bg-red-200'
          : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
      }`}
      title={confirmClear ? 'Click again to confirm' : 'New conversation'}
      aria-label={confirmClear ? 'Confirm clear chat' : 'Start new conversation'}
    >
      <SquarePen size={13} />
    </button>
  )
}

export default App
