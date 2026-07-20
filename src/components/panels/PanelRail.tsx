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
    <div className="flex flex-col items-center w-11 bg-gray-50 border-l border-gray-200 py-2 gap-1 shrink-0">
      {PANELS.map((panel) => {
        const isActive = activePanel === panel.id
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => handleClick(panel.id)}
            className={`
              w-9 h-9 rounded-lg flex items-center justify-center text-base
              transition-all duration-150 relative group
              ${isActive
                ? 'bg-blue-100 text-blue-700 shadow-sm ring-1 ring-blue-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }
            `}
            title={panel.label}
            aria-label={`${isActive ? 'Close' : 'Open'} ${panel.label} panel`}
            aria-pressed={isActive}
          >
            <span aria-hidden="true">{panel.icon}</span>
            {/* Tooltip */}
            <span className="absolute right-full mr-2 px-2 py-1 text-[11px] font-medium text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              {panel.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
