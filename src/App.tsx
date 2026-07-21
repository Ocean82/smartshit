import { useEffect, useState, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { fetchServerHealth, type ServerHealth } from '@/ai/agentClient'
import { Toolbar } from '@/components/Toolbar'
import { SpreadsheetGrid } from '@/components/SpreadsheetGrid'
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
import { Sparkles, Zap, Cloud, CloudOff, Loader2, Share2, MessageSquare } from 'lucide-react'
import { UserNav } from '@/auth'
import {
  getSyncStatus,
  onSyncStatusChange,
  scheduleSave,
  isCloudConfigured,
  type SyncStatus,
} from '@/lib/cloudSync'
import { exportWorkbookToJson, importWorkbookFromJsonFile, normalizeImportedWorkbook } from '@/io/workbookJson'

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
      if (e.key === 'Escape' && useStore.getState().activePanel) {
        setActivePanel(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img src="/smartsht-favicon.PNG" alt="smartsh!t" className="w-12 h-12 rounded-2xl shadow-lg" />
          <div className="text-sm text-gray-500 animate-pulse">Loading smartsh!t...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      <TitleBar
        onOpenTemplates={() => setShowTemplates(true)}
        onOpenCloudPicker={() => setShowWorkbookPicker(true)}
        onOpenShare={() => setShowShareDialog(true)}
      />
      {/* Desktop-only: traditional menu and toolbar */}
      <div className="hidden md:block">
        <MenuBar />
        <Toolbar />
      </div>
      <FormulaBar />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <FileExplorer />

        {/* Spreadsheet — always takes remaining space */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          <div className="flex-1 flex flex-col overflow-hidden relative pb-[52px] md:pb-0">
            <SpreadsheetGrid />
            <ChartOverlay />
          </div>
          <SheetTabs />
        </div>

        {/* Right-side panel system */}
        <DockPanel panelId="chat" title="Chat">
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

      {/* Mobile chat toggle FAB — positioned above mobile toolbar */}
      <button
        type="button"
        onClick={() => setActivePanel('chat')}
        className="md:hidden fixed bottom-16 right-4 z-30 p-3.5 rounded-full bg-gradient-to-r from-slate-800 to-blue-700 text-white shadow-lg hover:from-slate-900 hover:to-blue-800 transition-all active:scale-95"
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
    </div>
  )
}

function TitleBar({ onOpenTemplates, onOpenCloudPicker, onOpenShare }: { onOpenTemplates: () => void; onOpenCloudPicker: () => void; onOpenShare: () => void }) {
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
  const aiClass = health?.ok ? 'text-green-400' : 'text-amber-400'

  // Cloud sync badge
  const syncBadge = (() => {
    if (!isCloudConfigured()) {
      return (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
          <Zap size={10} className="text-green-400" />
          <span>Autosaved</span>
        </div>
      )
    }
    switch (syncStatus) {
      case 'syncing':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
            <Loader2 size={10} className="text-blue-400 animate-spin" />
            <span className="text-blue-300">Syncing...</span>
          </div>
        )
      case 'saved':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
            <Cloud size={10} className="text-green-400" />
            <span className="text-green-300">Saved</span>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
            <CloudOff size={10} className="text-red-400" />
            <span className="text-red-300">Sync error</span>
          </div>
        )
      case 'offline':
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
            <CloudOff size={10} className="text-amber-400" />
            <span className="text-amber-300">Offline</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
            <Cloud size={10} className="text-slate-400" />
            <span>Cloud</span>
          </div>
        )
    }
  })()

  return (
    <div className="h-10 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center px-2 md:px-4 gap-2 md:gap-3 shrink-0">
      {/* Mobile hamburger menu */}
      <MobileMenu />

      <div className="flex items-center gap-2">
        <img src="/smartsht-favicon.PNG" alt="smartsh!t" className="w-6 h-6 rounded-lg" />
        <span className="text-sm font-bold text-white tracking-tight hidden sm:inline">smartsh!t</span>
      </div>

      <div className="w-px h-5 bg-slate-600 hidden md:block" />

      <span className="text-xs text-slate-300 truncate max-w-[120px] md:max-w-[200px]">{workbook.name}</span>

      <button
        type="button"
        onClick={onOpenTemplates}
        className="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
      >
        Templates
      </button>

      <button
        type="button"
        onClick={onOpenCloudPicker}
        className="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors items-center gap-1"
      >
        <Cloud size={10} />
        Cloud
      </button>

      <button
        type="button"
        onClick={onOpenShare}
        className="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors items-center gap-1"
      >
        <Share2 size={10} />
        Share
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5 md:gap-2 text-slate-400 text-[10px]">
        <div className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 bg-slate-700/50 rounded-full">
          <Sparkles size={10} className="text-amber-400" />
          <span className={`${aiClass} hidden sm:inline`}>{aiLabel}</span>
          <span className={`${aiClass} sm:hidden`}>{health?.ok ? '●' : '○'}</span>
        </div>
        <span className="hidden md:inline">{syncBadge}</span>
        <span className="text-slate-500 hidden sm:inline">
          {new Date(workbook.updatedAt).toLocaleTimeString()}
        </span>
        <UserNav />
      </div>
    </div>
  )
}

export default App
