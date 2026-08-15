/**
 * DockPanel — Container that slides in from the right edge.
 * Provides: header with title + close button, resize handle, content slot.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { getPanelDef, type PanelId } from './panelTypes'
import { resolveDockPanelFrame } from './dockPanelLayout'
import { X } from 'lucide-react'

/** Per-panel header accent: subtle tinted background for visual identity */
const PANEL_HEADER_STYLES: Record<string, { bg: string; iconColor: string }> = {
  chat: { bg: 'var(--accent-50)', iconColor: 'var(--accent-600)' },
  insights: { bg: 'oklch(0.96 0.03 155)', iconColor: 'oklch(0.45 0.14 155)' },
  auditor: { bg: 'oklch(0.96 0.03 250)', iconColor: 'oklch(0.50 0.20 250)' },
  inspector: { bg: 'oklch(0.96 0.03 300)', iconColor: 'oklch(0.42 0.14 300)' },
}

interface DockPanelProps {
  panelId: PanelId
  children: React.ReactNode
  /** Optional: override the header title */
  title?: string
  /** Optional: extra controls in the header (right side, before X button) */
  headerActions?: React.ReactNode
}

/**
 * Renders an active dock panel with resizable content and header controls.
 *
 * @param panelId - Identifier of the panel to render and resize
 * @param children - The content to be rendered within the panel
 * @param title - Optional title displayed in the panel header
 * @param headerActions - Optional controls displayed before the close button
 * @returns The rendered dock panel when `panelId` matches the active panel, or `null` when the panel is closed.
 */
export function DockPanel({ panelId, children, title, headerActions }: DockPanelProps) {
  const activePanel = useStore((s) => s.activePanel)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const panelWidths = useStore((s) => s.panelWidths)
  const setPanelWidth = useStore((s) => s.setPanelWidth)

  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)
  const def = getPanelDef(panelId)
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? def.maxWidth + 360 : window.innerWidth,
  )

  useEffect(() => {
    const handleViewportResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [])

  const raw = panelWidths[panelId]
  const storedWidth = Number.isFinite(raw) ? (raw as number) : def.defaultWidth
  const frame = resolveDockPanelFrame(viewportWidth, def, storedWidth)
  const { width, minWidth, maxWidth: effectiveMaxWidth, isMobile } = frame
  const isOpen = activePanel === panelId

  useEffect(() => {
    if (isMobile) return
    if (storedWidth !== width) setPanelWidth(panelId, width)
  }, [isMobile, panelId, setPanelWidth, storedWidth, width])

  // Unmount cleanup: if the panel is closed mid-drag, release body styles and drag state.
  useEffect(() => {
    return () => {
      resizeStartRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const handleClose = () => setActivePanel(null)

  const resizeBy = useCallback((delta: number) => {
    setPanelWidth(panelId, Math.min(effectiveMaxWidth, Math.max(def.minWidth, width + delta)))
  }, [width, panelId, effectiveMaxWidth, def.minWidth, setPanelWidth])

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeStartRef.current = { x: e.clientX, width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start) return
    // The handle is on the left edge: moving left makes the panel wider.
    const delta = start.x - e.clientX
    setPanelWidth(panelId, Math.min(effectiveMaxWidth, Math.max(def.minWidth, start.width + delta)))
  }, [panelId, effectiveMaxWidth, def.minWidth, setPanelWidth])

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      resizeBy(20)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      resizeBy(-20)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setPanelWidth(panelId, def.minWidth)
    } else if (e.key === 'End') {
      e.preventDefault()
      setPanelWidth(panelId, effectiveMaxWidth)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setActivePanel(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, setActivePanel])

  if (!isOpen) return null

  return (
    <div
      className="dock-panel relative flex flex-col bg-white border-l border-gray-200 shrink-0 h-full max-md:fixed max-md:inset-0 max-md:z-40 max-md:border-l-0"
      style={{ width, minWidth, maxWidth: effectiveMaxWidth }}
    >
      {/* Resize handle (left edge) */}
      <div
        role="slider"
        aria-orientation="horizontal"
        aria-label={`Resize ${def.label} panel`}
        aria-valuemin={def.minWidth}
        aria-valuemax={effectiveMaxWidth}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onKeyDown={handleResizeKeyDown}
        className="absolute top-0 left-0 w-2 h-full cursor-col-resize z-10 group hover:bg-blue-400/30 active:bg-blue-500/40 touch-none max-md:hidden"
      >
        <div className="absolute top-1/2 left-0 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 group-hover:bg-blue-500 transition-colors" />
      </div>

      {/* Header */}
      <div
        className="px-3 py-2.5 border-b flex items-center justify-between shrink-0 max-md:pt-[max(0.625rem,env(safe-area-inset-top))]"
        style={{
          borderColor: 'var(--neutral-200)',
          background: PANEL_HEADER_STYLES[panelId]?.bg ?? 'transparent',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm" aria-hidden="true" style={{ color: PANEL_HEADER_STYLES[panelId]?.iconColor }}>{def.icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: 'var(--neutral-700)' }}>
            {title ?? def.label}
          </h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}
          <button
            type="button"
            onClick={handleClose}
            className="p-1 max-md:p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
