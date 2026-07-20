/**
 * DockPanel — Container that slides in from the right edge.
 * Provides: header with title + close button, resize handle, content slot.
 */

import { useCallback, useRef } from 'react'
import { useStore } from '@/store/useStore'
import { getPanelDef, type PanelId } from './panelTypes'
import { X } from 'lucide-react'

interface DockPanelProps {
  panelId: PanelId
  children: React.ReactNode
  /** Optional: override the header title */
  title?: string
  /** Optional: extra controls in the header (right side, before X button) */
  headerActions?: React.ReactNode
}

export function DockPanel({ panelId, children, title, headerActions }: DockPanelProps) {
  const activePanel = useStore((s) => s.activePanel)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const panelWidths = useStore((s) => s.panelWidths)
  const setPanelWidth = useStore((s) => s.setPanelWidth)

  const resizingRef = useRef(false)
  const def = getPanelDef(panelId)

  const width = panelWidths[panelId] ?? def.defaultWidth
  const isOpen = activePanel === panelId

  const handleClose = () => setActivePanel(null)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startWidth = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      // Dragging left edge → moving left means bigger panel
      const delta = startX - ev.clientX
      const newWidth = Math.min(def.maxWidth, Math.max(def.minWidth, startWidth + delta))
      setPanelWidth(panelId, newWidth)
    }

    const onUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width, panelId, def.maxWidth, def.minWidth, setPanelWidth])

  if (!isOpen) return null

  return (
    <div
      className="relative flex flex-col bg-white border-l border-gray-200 shrink-0 h-full"
      style={{ width, minWidth: def.minWidth, maxWidth: def.maxWidth }}
    >
      {/* Resize handle (left edge) */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${def.label} panel`}
        onMouseDown={handleResizeStart}
        className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-10 group hover:bg-blue-400/30 active:bg-blue-500/40"
      >
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 group-hover:bg-blue-500 transition-colors" />
      </div>

      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm" aria-hidden="true">{def.icon}</span>
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider truncate">
            {title ?? def.label}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title={`Close ${def.label}`}
            aria-label={`Close ${def.label} panel`}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {children}
      </div>
    </div>
  )
}
