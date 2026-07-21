/**
 * PanelRail — Thin icon rail on the right edge of the screen.
 * Each icon toggles a docked panel. Active icon is highlighted.
 */

import { useStore } from '@/store/useStore'
import { PANELS, type PanelId } from './panelTypes'

export function PanelRail() {
  const activePanel = useStore((s) => s.activePanel)
  const setActivePanel = useStore((s) => s.setActivePanel)

  const handleClick = (id: PanelId) => {
    setActivePanel(activePanel === id ? null : id)
  }

  return (
    <div className="flex flex-col items-center w-11 border-l py-2.5 gap-1.5 shrink-0" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--neutral-200)' }}>
      {PANELS.map((panel) => {
        const isActive = activePanel === panel.id
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => handleClick(panel.id)}
            className={`
              w-8 h-8 rounded-lg flex items-center justify-center text-base
              transition-all duration-150 relative group
              ${isActive
                ? 'ring-1 ring-blue-200'
                : 'hover:text-slate-700'
              }
            `}
            style={isActive
              ? { background: 'var(--accent-50)', color: 'var(--accent-700)' }
              : { color: 'var(--neutral-500)' }
            }
            title={panel.label}
            aria-label={`${isActive ? 'Close' : 'Open'} ${panel.label} panel`}
            aria-pressed={isActive}
          >
            <span aria-hidden="true">{panel.icon}</span>
            {/* Tooltip */}
            <span className="absolute right-full mr-2 px-2 py-1 text-[11px] font-medium text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap" style={{ background: 'var(--neutral-900)' }}>
              {panel.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
