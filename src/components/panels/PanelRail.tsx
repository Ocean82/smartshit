/**
 * PanelRail — Thin icon rail on the right edge of the screen.
 * Each icon toggles a docked panel. Active icon is highlighted.
 * Shows text labels on first visit (dismissible).
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import { useStore } from '@/store/useStore'
import { PANELS, type PanelId } from './panelTypes'
import { MessageSquare, BarChart3, ShieldCheck, Microscope } from 'lucide-react'

const PANEL_ICONS: Record<PanelId, ReactNode> = {
  chat: <MessageSquare size={18} />,
  insights: <BarChart3 size={18} />,
  auditor: <ShieldCheck size={18} />,
  inspector: <Microscope size={18} />,
}

/** Per-panel accent colors for active state */
const PANEL_COLORS: Record<PanelId, { bg: string; text: string; ring: string }> = {
  chat: { bg: 'var(--accent-50)', text: 'var(--accent-700)', ring: 'var(--accent-200)' },
  insights: { bg: 'oklch(0.95 0.04 155)', text: 'oklch(0.35 0.12 155)', ring: 'oklch(0.85 0.08 155)' },
  auditor: { bg: 'oklch(0.95 0.04 250)', text: 'oklch(0.40 0.20 250)', ring: 'oklch(0.85 0.10 250)' },
  inspector: { bg: 'oklch(0.95 0.04 300)', text: 'oklch(0.38 0.14 300)', ring: 'oklch(0.85 0.08 300)' },
}

export function PanelRail() {
  const activePanel = useStore((s) => s.activePanel)
  const setActivePanel = useStore((s) => s.setActivePanel)
  const [showLabels, setShowLabels] = useState(() => {
    try {
      return !localStorage.getItem('smartsht-rail-labels-dismissed')
    } catch {
      return true
    }
  })

  const handleClick = (id: PanelId) => {
    setActivePanel(activePanel === id ? null : id)
    // Dismiss labels after any panel interaction
    if (showLabels) {
      setShowLabels(false)
      try { localStorage.setItem('smartsht-rail-labels-dismissed', '1') } catch { /* */ }
    }
  }

  return (
    <div
      className="flex flex-col items-center border-l py-2.5 gap-1 shrink-0 transition-all"
      style={{
        background: 'var(--neutral-50)',
        borderColor: 'var(--neutral-200)',
        width: showLabels ? '72px' : '44px',
        boxShadow: 'inset 1px 0 0 var(--neutral-200)',
      }}
    >
      {PANELS.map((panel) => {
        const isActive = activePanel === panel.id
        const colors = PANEL_COLORS[panel.id]
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => handleClick(panel.id)}
            className={`
              rounded-lg flex items-center transition-all duration-150 relative group
              ${showLabels ? 'w-[60px] h-8 gap-1.5 px-2 justify-start' : 'w-8 h-8 justify-center'}
              ${isActive ? '' : 'hover:text-slate-700'}
            `}
            style={isActive
              ? { background: colors.bg, color: colors.text, boxShadow: `inset 0 0 0 1px ${colors.ring}` }
              : { color: 'var(--neutral-500)' }
            }
            aria-label={`${isActive ? 'Close' : 'Open'} ${panel.label} panel`}
            aria-pressed={isActive}
          >
            {PANEL_ICONS[panel.id]}
            {showLabels && (
              <span className="text-[10px] font-medium leading-none truncate">
                {panel.label}
              </span>
            )}
            {/* Tooltip — only when labels are hidden */}
            {!showLabels && (
              <span className="absolute right-full mr-2 px-2 py-1 text-[11px] font-medium text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap" style={{ background: 'var(--neutral-900)' }}>
                {panel.label}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
