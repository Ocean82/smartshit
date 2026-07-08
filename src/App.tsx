import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import { fetchServerHealth, type ServerHealth } from '@/ai/agentClient'
import { Toolbar } from '@/components/Toolbar'
import { SpreadsheetGrid } from '@/components/SpreadsheetGrid'
import { ChatPanel } from '@/components/ChatPanel'
import { SheetTabs } from '@/components/SheetTabs'
import { FileExplorer } from '@/components/FileExplorer'
import { SkillsPanel } from '@/components/SkillsPanel'
import { ContextMenu } from '@/components/ContextMenu'
import { ChartDialog } from '@/components/ChartDialog'
import { ChartOverlay } from '@/components/ChartRenderer'
import { StatusBar } from '@/components/StatusBar'
import { WelcomeOverlay } from '@/components/WelcomeOverlay'
import { SummaryCards } from '@/components/SummaryCards'
import { TemplateGallery } from '@/components/TemplateGallery'
import { TelemetryDebugPanel } from '@/components/TelemetryDebugPanel'
import { Sparkles, Zap } from 'lucide-react'

function App() {
  const { workbook, engine } = useStore()
  const [isLoaded, setIsLoaded] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  useEffect(() => {
    engine.loadWorkbook(workbook)
    setIsLoaded(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-blue-700 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-sm">s!</span>
          </div>
          <div className="text-sm text-gray-500 animate-pulse">Loading smartsh!t...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      <TitleBar onOpenTemplates={() => setShowTemplates(true)} />

      <Toolbar />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <FileExplorer />
        <SkillsPanel />

        {/* Chat-first: assistant on the left */}
        <ChatPanel />

        {/* Spreadsheet + summary on the right */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
          <SummaryCards />
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <SpreadsheetGrid />
            <ChartOverlay />
          </div>
          <SheetTabs />
        </div>
      </div>

      <StatusBar />
      <ContextMenu />
      <ChartDialog />
      <WelcomeOverlay onOpenTemplates={() => setShowTemplates(true)} />
      <TemplateGallery open={showTemplates} onClose={() => setShowTemplates(false)} />
      {import.meta.env.DEV ? <TelemetryDebugPanel /> : null}
    </div>
  )
}

function TitleBar({ onOpenTemplates }: { onOpenTemplates: () => void }) {
  const { workbook } = useStore()
  const [health, setHealth] = useState<ServerHealth | null>(null)

  useEffect(() => {
    void fetchServerHealth().then(setHealth)
    const id = setInterval(() => { void fetchServerHealth().then(setHealth) }, 15000)
    return () => clearInterval(id)
  }, [])

  const aiLabel = health?.ok ? 'AI online' : health?.ollama ? 'Model loading' : 'AI offline'
  const aiClass = health?.ok ? 'text-green-400' : 'text-amber-400'

  return (
    <div className="h-10 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
          <span className="text-white font-black text-[10px]">s!</span>
        </div>
        <span className="text-sm font-bold text-white tracking-tight">smartsh!t</span>
      </div>

      <div className="w-px h-5 bg-slate-600" />

      <span className="text-xs text-slate-300 truncate max-w-[200px]">{workbook.name}</span>

      <button
        type="button"
        onClick={onOpenTemplates}
        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors"
      >
        Templates
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2 text-slate-400 text-[10px]">
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
          <Sparkles size={10} className="text-amber-400" />
          <span className={aiClass}>{aiLabel}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 rounded-full">
          <Zap size={10} className="text-green-400" />
          <span>Autosaved</span>
        </div>
        <span className="text-slate-500 hidden sm:inline">
          {new Date(workbook.updatedAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}

export default App
