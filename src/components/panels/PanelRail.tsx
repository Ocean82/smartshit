/**
 * PanelRail — Thin icon rail on the right edge of the screen.
 * Each icon toggles a docked panel. Active icon is highlighted.
 * Shows text labels on first visit (dismissible).
 */

import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { PANELS, type PanelId } from './panelTypes'
import { MessageSquare, BarChart3, Shield, Microscope } from 'lucide-react'

const PANEL_ICONS: Record<PanelId, React.ReactNode> = {
  chat: <MessageSquare size={16} />,
  insights: <BarChart3 size={16} />,
  auditor: <Shield size={16} />,
  inspector: <Microscope size={16} />,
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
        background: 'var(--surface-secondary)',
        borderColor: 'var(--neutral-200)',
        width: showLabels ? '72px' : '44px',
      }}
    >
      {PANELS.map((panel) => {
        const isActive = activePanel === panel.id
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => handleClick(panel.id)}
            className={`
              rounded-lg flex items-center transition-all duration-150 relative group
              ${showLabels ? 'w-[60px] h-8 gap-1.5 px-2 justify-start' : 'w-8 h-8 justify-center'}
              ${isActive ? 'ring-1 ring-blue-200' : 'hover:text-slate-700'}
            `}
            style={isActive
              ? { background: 'var(--accent-50)', color: 'var(--accent-700)' }
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
