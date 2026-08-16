import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/store/useStore'
import { cellToRef } from '@/engine/spreadsheet'
import { getCellNotesService } from '@/lib/cellNotes'
import { AnchoredPanel } from '@/components/AnchoredPanel'
import {
  Copy, Scissors, ClipboardPaste, Trash2, Plus,
  ArrowDown, ArrowRight, Bold, Italic, Shield, StickyNote, X, Check,
} from 'lucide-react'

interface ContextAction {
  icon: ReactNode
  label: string
  shortcut?: string
  action: () => void
}

export function ContextMenu() {
  const {
    contextMenu,
    setContextMenu,
    copy,
    cut,
    paste,
    pushHistory,
    insertRow,
    insertColumn,
    deleteRow,
    deleteColumn,
    setRangeFormat,
    setCellValue,
    activeSheetId,
  } = useStore(useShallow((s) => ({
    contextMenu: s.contextMenu,
    setContextMenu: s.setContextMenu,
    copy: s.copy,
    cut: s.cut,
    paste: s.paste,
    pushHistory: s.pushHistory,
    insertRow: s.insertRow,
    insertColumn: s.insertColumn,
    deleteRow: s.deleteRow,
    deleteColumn: s.deleteColumn,
    setRangeFormat: s.setRangeFormat,
    setCellValue: s.setCellValue,
    activeSheetId: s.activeSheetId,
  })))

  const [noteMode, setNoteMode] = useState<'idle' | 'editing'>('idle')
  const [noteText, setNoteText] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const close = useCallback(() => setContextMenu(null), [setContextMenu])

  useEffect(() => {
    setNoteMode('idle')
    setNoteText('')
  }, [contextMenu?.cell])

  useEffect(() => {
    if (noteMode === 'editing') {
      requestAnimationFrame(() => noteRef.current?.focus())
    }
  }, [noteMode])

  if (!contextMenu) return null

  const ref = cellToRef(contextMenu.cell)
  const notesService = getCellNotesService()
  const sheetId = activeSheetId
  const existingNote = notesService.getNote(sheetId, contextMenu.cell)

  const openNoteEditor = () => {
    setNoteText(existingNote?.text ?? '')
    setNoteMode('editing')
  }

  const commitNote = () => {
    const trimmed = noteText.trim()
    if (trimmed) {
      notesService.setNote(sheetId, contextMenu.cell, trimmed)
    } else if (existingNote) {
      notesService.removeNote(sheetId, contextMenu.cell)
    }
    close()
  }

  const handleNoteKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commitNote()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
    e.stopPropagation()
  }

  const runAndClose = (action: () => void) => {
    action()
    close()
  }

  const menuItems: Array<ContextAction | null> = [
    { icon: <Copy size={13} />, label: 'Copy', shortcut: 'Ctrl+C', action: () => runAndClose(copy) },
    { icon: <Scissors size={13} />, label: 'Cut', shortcut: 'Ctrl+X', action: () => runAndClose(cut) },
    { icon: <ClipboardPaste size={13} />, label: 'Paste', shortcut: 'Ctrl+V', action: () => runAndClose(paste) },
    null,
    {
      icon: <Plus size={13} />,
      label: 'Insert Row Below',
      action: () => runAndClose(() => { pushHistory('Insert row'); insertRow(ref.row) }),
    },
    {
      icon: <ArrowDown size={13} />,
      label: 'Insert Column Right',
      action: () => runAndClose(() => { pushHistory('Insert column'); insertColumn(ref.col) }),
    },
    null,
    {
      icon: <Trash2 size={13} />,
      label: 'Delete Row',
      action: () => runAndClose(() => { pushHistory('Delete row'); deleteRow(ref.row) }),
    },
    {
      icon: <ArrowRight size={13} />,
      label: 'Delete Column',
      action: () => runAndClose(() => { pushHistory('Delete column'); deleteColumn(ref.col) }),
    },
    null,
    {
      icon: <Bold size={13} />,
      label: 'Bold',
      shortcut: 'Ctrl+B',
      action: () => runAndClose(() => setRangeFormat({ bold: true })),
    },
    {
      icon: <Italic size={13} />,
      label: 'Italic',
      shortcut: 'Ctrl+I',
      action: () => runAndClose(() => setRangeFormat({ italic: true })),
    },
    null,
    {
      icon: <Trash2 size={13} />,
      label: 'Clear Cell',
      action: () => runAndClose(() => { pushHistory('Clear'); setCellValue(contextMenu.cell, null) }),
    },
    null,
    {
      icon: <Shield size={13} />,
      label: 'Data Validation',
      action: () => runAndClose(() => useStore.getState().setShowValidationDialog(true)),
    },
    null,
    {
      icon: <StickyNote size={13} />,
      label: existingNote ? 'Edit Note' : 'Add Note',
      action: openNoteEditor,
    },
    ...(existingNote ? [{
      icon: <Trash2 size={13} />,
      label: 'Remove Note',
      action: () => runAndClose(() => notesService.removeNote(sheetId, contextMenu.cell)),
    }] : []),
  ]

  return (
    <AnchoredPanel
      open
      onClose={close}
      anchorPoint={{ x: contextMenu.x, y: contextMenu.y }}
      width={220}
      maxHeight={noteMode === 'editing' ? 260 : 420}
      aria-label={`Cell actions for ${contextMenu.cell}`}
      className="rounded-xl border py-1.5 shadow-xl"
      style={{ background: 'var(--surface-panel)', borderColor: 'var(--neutral-200)' }}
    >
      <div className="px-3 py-1 text-[10px] font-mono select-none" style={{ color: 'var(--ink-muted)' }}>
        {contextMenu.cell}
      </div>

      {noteMode === 'editing' ? (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] font-medium" style={{ color: 'var(--ink-secondary)' }}>
            {existingNote ? 'Edit note' : 'Add note'}
          </p>
          <textarea
            ref={noteRef}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleNoteKeyDown}
            rows={3}
            placeholder="Type a note… (Ctrl+Enter to save)"
            className="w-full resize-none rounded-lg border px-2.5 py-2 text-xs outline-none transition-colors focus:ring-2"
            style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }}
          />
          <div className="flex gap-1.5 justify-end">
            <button
              type="button"
              onClick={close}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border transition-colors"
              style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-secondary)' }}
            >
              <X size={11} /> Cancel
            </button>
            <button
              type="button"
              onClick={commitNote}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg text-white transition-colors"
              style={{ background: 'var(--accent-600)' }}
            >
              <Check size={11} /> Save
            </button>
          </div>
        </div>
      ) : (
        menuItems.map((item, i) => {
          if (!item) {
            return <div key={i} className="my-1" style={{ borderTop: '1px solid var(--neutral-100)' }} />
          }
          return (
            <button
              key={i}
              type="button"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs transition-colors"
              style={{ color: 'var(--ink-primary)' }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--accent-50)'
                e.currentTarget.style.color = 'var(--accent-700)'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--ink-primary)'
              }}
              onClick={item.action}
            >
              <span style={{ color: 'var(--neutral-400)' }}>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{item.shortcut}</span>
              )}
            </button>
          )
        })
      )}
    </AnchoredPanel>
  )
}
