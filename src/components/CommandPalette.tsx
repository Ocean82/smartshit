import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Sparkles, MessageSquare, LayoutTemplate, BarChart2, Table2,
  Paintbrush, Download, Undo2, Redo2, FileJson, X,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { getPopularTemplates } from '@/data/templates'
import { exportWorkbookToXlsx, exportSheetToCsv } from '@/io/xlsx'
import { hasTemplateSpec } from '@/templates'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onOpenTemplates: () => void
  onFocusChat: () => void
  /** Optional until Phase 4 JSON IO lands — omitted from list when unset */
  onExportJson?: () => void
  onImportJson?: () => void
}

interface PaletteCommand {
  id: string
  label: string
  description: string
  category: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  onOpenTemplates,
  onFocusChat,
  onExportJson,
  onImportJson,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    setShowChat,
    setShowChartDialog,
    setShowPivotDialog,
    setShowConditionalFormatDialog,
    undo,
    redo,
    runTemplateTool,
    workbook,
    getActiveSheet,
  } = useStore()

  const commands = useMemo((): PaletteCommand[] => {
    const popular = getPopularTemplates()
      .filter((t) => t.tools.some((tool) => hasTemplateSpec(tool)))
      .slice(0, 6)

    const list: PaletteCommand[] = [
      {
        id: 'focus-chat',
        label: 'Focus chat input',
        description: 'Open the assistant and focus the message box',
        category: 'Chat',
        icon: <MessageSquare size={16} className="text-blue-600" />,
        run: () => {
          setShowChat(true)
          onFocusChat()
        },
      },
      {
        id: 'open-templates',
        label: 'Open template gallery',
        description: 'Browse and apply spreadsheet templates',
        category: 'Templates',
        icon: <LayoutTemplate size={16} className="text-violet-600" />,
        run: onOpenTemplates,
      },
      ...popular.map((t) => {
        const tool = t.tools.find((name) => hasTemplateSpec(name))!
        return {
          id: `tpl-${t.id}`,
          label: `Build: ${t.name}`,
          description: t.description,
          category: 'Templates',
          icon: <Sparkles size={16} className="text-amber-500" />,
          run: () => runTemplateTool(tool),
        }
      }),
      {
        id: 'chart',
        label: 'Insert chart',
        description: 'Open the chart builder',
        category: 'Tools',
        icon: <BarChart2 size={16} className="text-emerald-600" />,
        run: () => setShowChartDialog(true),
      },
      {
        id: 'pivot',
        label: 'Create pivot table',
        description: 'Open the pivot dialog',
        category: 'Tools',
        icon: <Table2 size={16} className="text-cyan-600" />,
        run: () => setShowPivotDialog(true),
      },
      {
        id: 'cf',
        label: 'Conditional formatting',
        description: 'Highlight cells by rule',
        category: 'Tools',
        icon: <Paintbrush size={16} className="text-pink-600" />,
        run: () => setShowConditionalFormatDialog(true),
      },
      {
        id: 'export-xlsx',
        label: 'Export as Excel',
        description: 'Download the workbook as .xlsx',
        category: 'File',
        icon: <Download size={16} className="text-gray-600" />,
        run: () => exportWorkbookToXlsx(workbook),
      },
      {
        id: 'export-csv',
        label: 'Export sheet as CSV',
        description: 'Download the active sheet as CSV',
        category: 'File',
        icon: <Download size={16} className="text-gray-500" />,
        run: () => exportSheetToCsv(getActiveSheet(), getActiveSheet().name || 'sheet'),
      },
      {
        id: 'undo',
        label: 'Undo',
        description: 'Undo the last change',
        category: 'Edit',
        icon: <Undo2 size={16} className="text-gray-600" />,
        run: undo,
      },
      {
        id: 'redo',
        label: 'Redo',
        description: 'Redo the last undone change',
        category: 'Edit',
        icon: <Redo2 size={16} className="text-gray-600" />,
        run: redo,
      },
    ]

    if (onExportJson) {
      list.push({
        id: 'export-json',
        label: 'Backup workbook as JSON',
        description: 'Download a full workbook JSON backup',
        category: 'File',
        icon: <FileJson size={16} className="text-indigo-600" />,
        run: onExportJson,
      })
    }
    if (onImportJson) {
      list.push({
        id: 'import-json',
        label: 'Restore workbook from JSON',
        description: 'Import a previously exported JSON backup',
        category: 'File',
        icon: <FileJson size={16} className="text-indigo-500" />,
        run: onImportJson,
      })
    }

    return list
  }, [
    workbook,
    getActiveSheet,
    onOpenTemplates,
    onFocusChat,
    onExportJson,
    onImportJson,
    runTemplateTool,
    setShowChat,
    setShowChartDialog,
    setShowPivotDialog,
    setShowConditionalFormatDialog,
    undo,
    redo,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q)
        || c.description.toLowerCase().includes(q)
        || c.category.toLowerCase().includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedIndex(0)
      return
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!open) return null

  function runSelected(index: number) {
    const cmd = filtered[index]
    if (!cmd) return
    onClose()
    cmd.run()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[12vh] px-4">
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex((i) => Math.max(0, i - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                runSelected(selectedIndex)
              }
            }}
            placeholder="Type a command…"
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No matching commands</p>
          ) : (
            filtered.map((cmd, index) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => runSelected(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="mt-0.5 shrink-0">{cmd.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate">{cmd.label}</span>
                  <span className="block text-xs text-gray-500 truncate">{cmd.description}</span>
                </span>
                <span className="text-[10px] text-gray-400 shrink-0 mt-1">{cmd.category}</span>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex gap-3">
          <span>↑↓ navigate</span>
          <span>Enter run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
