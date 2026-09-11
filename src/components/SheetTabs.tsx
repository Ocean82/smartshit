import React, { useState, useRef, useCallback } from 'react'
import { useStore } from '@/store/useStore'
import { Plus, X, Edit3, Check, ChevronDown } from 'lucide-react'
import { AnchoredPanel } from '@/components/AnchoredPanel'
import { BG_COLORS } from '@/data/colors'

export function SheetTabs() {
  const {
    workbook,
    activeSheetId,
    setActiveSheet,
    addSheet,
    deleteSheet,
    renameSheet,
    duplicateSheet,
    moveSheet,
    setSheetTabColor,
    hideSheet,
    unhideSheet,
    showConfirm,
    showToast,
    undo,
  } = useStore()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ sheetId: string; x: number; y: number } | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const tabsRef = useRef<HTMLDivElement>(null)
  const hiddenBtnRef = useRef<HTMLButtonElement>(null)

  const visibleSheets = workbook.sheets.filter((s) => !s.hidden)
  const hiddenSheets = workbook.sheets.filter((s) => s.hidden)

  const handleStartRename = (sheetId: string, currentName: string) => {
    setRenamingId(sheetId)
    setRenameValue(currentName)
    setMenu(null)
  }

  const handleFinishRename = () => {
    if (renamingId && renameValue.trim()) renameSheet(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, visibleIndex: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const nextIndex = e.key === 'ArrowRight'
        ? (visibleIndex + 1) % visibleSheets.length
        : (visibleIndex - 1 + visibleSheets.length) % visibleSheets.length
      setActiveSheet(visibleSheets[nextIndex].id)
      const tabs = tabsRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')
      tabs?.[nextIndex]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveSheet(visibleSheets[0].id)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveSheet(visibleSheets[visibleSheets.length - 1].id)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setActiveSheet(visibleSheets[visibleIndex].id)
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault()
      const el = e.currentTarget as HTMLElement
      const r = el.getBoundingClientRect()
      setMenu({ sheetId: visibleSheets[visibleIndex].id, x: r.left, y: r.bottom })
    }
  }, [visibleSheets, setActiveSheet])

  const confirmDelete = (sheetId: string, sheetName: string) => {
    setMenu(null)
    showConfirm({
      title: 'Delete sheet',
      message: `"${sheetName}" and all its data will be permanently removed.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: () => {
        deleteSheet(sheetId)
        showToast({ type: 'success', message: `Deleted "${sheetName}"`, undoAction: undo })
      },
    })
  }

  const menuSheet = menu ? workbook.sheets.find((s) => s.id === menu.sheetId) : null
  const menuFullIndex = menuSheet ? workbook.sheets.findIndex((s) => s.id === menuSheet.id) : -1

  return (
    <div
      className="border-t flex items-center px-2 h-11 md:h-8 overflow-x-auto shrink-0"
      ref={tabsRef}
      role="tablist"
      aria-label="Sheet tabs"
      style={{ background: 'var(--surface-secondary)', borderColor: 'var(--neutral-200)' }}
    >
      {visibleSheets.map((sheet, visibleIndex) => {
        const fullIndex = workbook.sheets.findIndex((s) => s.id === sheet.id)
        const isActive = sheet.id === activeSheetId
        return (
          <div
            key={sheet.id}
            role="tab"
            aria-selected={isActive}
            aria-label={sheet.name}
            tabIndex={isActive ? 0 : -1}
            draggable={renamingId !== sheet.id}
            className={`relative flex items-center gap-1 px-3 py-1 text-[11px] font-medium cursor-pointer transition-colors group ${
              isActive ? 'rounded-t-md border border-b-white -mb-px shadow-sm' : 'rounded-md'
            } ${dragId === sheet.id ? 'opacity-50' : ''}`}
            style={isActive
              ? { background: 'var(--surface-panel)', borderColor: 'var(--neutral-200)', color: 'var(--accent-700)' }
              : { color: 'var(--ink-secondary)' }
            }
            onClick={() => setActiveSheet(sheet.id)}
            onDoubleClick={() => handleStartRename(sheet.id, sheet.name)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ sheetId: sheet.id, x: e.clientX, y: e.clientY })
            }}
            onKeyDown={(e) => handleTabKeyDown(e, visibleIndex)}
            onDragStart={(e) => {
              setDragId(sheet.id)
              e.dataTransfer.setData('text/plain', sheet.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain') || dragId
              if (!id || id === sheet.id) return
              moveSheet(id, fullIndex)
              setDragId(null)
            }}
          >
            {sheet.tabColor && (
              <span
                className="absolute left-0 right-0 bottom-0 h-0.5 rounded-b"
                style={{ background: sheet.tabColor }}
                aria-hidden
              />
            )}
            {renamingId === sheet.id ? (
              <div className="flex items-center gap-1">
                <input
                  className="w-24 text-xs px-1 py-0 border rounded outline-none"
                  style={{ borderColor: 'var(--accent-400)' }}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleFinishRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  autoFocus
                  aria-label={`Rename sheet ${sheet.name}`}
                />
                <button type="button" onClick={handleFinishRename} style={{ color: 'var(--success)' }}>
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <>
                <span>{sheet.name}</span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ml-1 transition-opacity [@media(pointer:coarse)]:opacity-70"
                  style={{ color: 'var(--neutral-400)' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStartRename(sheet.id, sheet.name)
                  }}
                  aria-label={`Rename sheet ${sheet.name}`}
                >
                  <Edit3 size={10} />
                </button>
                {workbook.sheets.length > 1 && (
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 ml-0.5 transition-opacity [@media(pointer:coarse)]:opacity-70"
                    style={{ color: 'var(--neutral-400)' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmDelete(sheet.id, sheet.name)
                    }}
                    aria-label={`Delete sheet ${sheet.name}`}
                  >
                    <X size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}

      <button
        type="button"
        className="p-1 ml-1 rounded transition-colors"
        style={{ color: 'var(--neutral-400)' }}
        onClick={() => addSheet()}
        title="Add Sheet"
        aria-label="Add sheet"
      >
        <Plus size={14} />
      </button>

      {hiddenSheets.length > 0 && (
        <>
          <button
            ref={hiddenBtnRef}
            type="button"
            className="flex items-center gap-0.5 px-1.5 py-0.5 ml-1 rounded text-[10px] transition-colors"
            style={{ color: 'var(--ink-secondary)' }}
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            aria-label="Hidden sheets"
            title="Hidden sheets"
          >
            Hidden ({hiddenSheets.length})
            <ChevronDown size={10} />
          </button>
          <AnchoredPanel
            open={showHidden}
            onClose={() => setShowHidden(false)}
            anchorRef={hiddenBtnRef}
            width={180}
            maxHeight={240}
            aria-label="Unhide sheets"
            className="rounded-lg shadow-xl border border-gray-200 text-xs py-1"
            style={{ background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
          >
            {hiddenSheets.map((s) => (
              <button
                key={s.id}
                type="button"
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                onClick={() => { unhideSheet(s.id); setShowHidden(false) }}
              >
                Unhide “{s.name}”
              </button>
            ))}
          </AnchoredPanel>
        </>
      )}

      {menu && menuSheet && (
        <AnchoredPanel
          open
          onClose={() => setMenu(null)}
          anchorPoint={{ x: menu.x, y: menu.y }}
          width={200}
          maxHeight={360}
          aria-label="Sheet tab menu"
          className="rounded-lg shadow-xl border border-gray-200 text-xs py-1"
          style={{ background: 'var(--surface-panel)', color: 'var(--ink-primary)' }}
        >
          <MenuItem label="Rename" onClick={() => handleStartRename(menuSheet.id, menuSheet.name)} />
          <MenuItem label="Duplicate" onClick={() => { duplicateSheet(menuSheet.id); setMenu(null) }} />
          <MenuItem
            label="Move Left"
            disabled={menuFullIndex <= 0}
            onClick={() => { moveSheet(menuSheet.id, menuFullIndex - 1); setMenu(null) }}
          />
          <MenuItem
            label="Move Right"
            disabled={menuFullIndex < 0 || menuFullIndex >= workbook.sheets.length - 1}
            onClick={() => { moveSheet(menuSheet.id, menuFullIndex + 1); setMenu(null) }}
          />
          <div className="border-t border-gray-200 my-1" />
          <p className="px-3 py-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Tab color</p>
          <div className="grid grid-cols-7 gap-1 px-3 py-1">
            <button
              type="button"
              className="w-5 h-5 rounded border border-gray-300 text-[9px]"
              title="No color"
              aria-label="Clear tab color"
              onClick={() => { setSheetTabColor(menuSheet.id, null); setMenu(null) }}
            >
              ∅
            </button>
            {BG_COLORS.filter((c) => c !== '#FFFFFF').slice(0, 13).map((color) => (
              <button
                key={color}
                type="button"
                className="w-5 h-5 rounded border border-gray-200"
                style={{ backgroundColor: color }}
                aria-label={`Tab color ${color}`}
                onClick={() => { setSheetTabColor(menuSheet.id, color); setMenu(null) }}
              />
            ))}
          </div>
          <div className="border-t border-gray-200 my-1" />
          <MenuItem
            label="Hide"
            disabled={visibleSheets.length <= 1}
            onClick={() => { hideSheet(menuSheet.id); setMenu(null) }}
          />
          {workbook.sheets.length > 1 && (
            <MenuItem
              label="Delete"
              danger
              onClick={() => confirmDelete(menuSheet.id, menuSheet.name)}
            />
          )}
        </AnchoredPanel>
      )}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100'}`}
      style={danger && !disabled ? { color: 'var(--danger, #dc2626)' } : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
