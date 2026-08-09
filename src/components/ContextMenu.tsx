import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useStore } from '@/store/useStore';
import { cellToRef } from '@/engine/spreadsheet';
import { getCellNotesService } from '@/lib/cellNotes';
import {
  Copy, Scissors, ClipboardPaste, Trash2, Plus,
  ArrowDown, ArrowRight, Bold, Italic, Shield, StickyNote, X, Check,
} from 'lucide-react';

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
  } = useStore();

  const [noteMode, setNoteMode] = useState<'idle' | 'editing'>('idle');
  const [noteText, setNoteText] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Reset note editor whenever the menu closes or opens on a new cell
  useEffect(() => {
    setNoteMode('idle');
    setNoteText('');
  }, [contextMenu?.cell]);

  // Focus the textarea when entering edit mode
  useEffect(() => {
    if (noteMode === 'editing') {
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  }, [noteMode]);

  // Close on any outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const ref = cellToRef(contextMenu.cell);
  const notesService = getCellNotesService();
  const sheetId = useStore.getState().activeSheetId;
  const existingNote = notesService.getNote(sheetId, contextMenu.cell);

  const openNoteEditor = () => {
    setNoteText(existingNote?.text ?? '');
    setNoteMode('editing');
  };

  const commitNote = () => {
    const trimmed = noteText.trim();
    if (trimmed) {
      notesService.setNote(sheetId, contextMenu.cell, trimmed);
    } else if (existingNote) {
      notesService.removeNote(sheetId, contextMenu.cell);
    }
    setContextMenu(null);
  };

  const handleNoteKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commitNote();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setContextMenu(null);
    }
    // Prevent the grid from receiving keystrokes while editing
    e.stopPropagation();
  };

  const menuItems = [
    { icon: <Copy size={13} />, label: 'Copy', shortcut: 'Ctrl+C', action: () => { copy(); } },
    { icon: <Scissors size={13} />, label: 'Cut', shortcut: 'Ctrl+X', action: () => { cut(); } },
    { icon: <ClipboardPaste size={13} />, label: 'Paste', shortcut: 'Ctrl+V', action: () => { paste(); } },
    null,
    { icon: <Plus size={13} />, label: 'Insert Row Below', action: () => { pushHistory('Insert row'); insertRow(ref.row); } },
    { icon: <ArrowDown size={13} />, label: 'Insert Column Right', action: () => { pushHistory('Insert column'); insertColumn(ref.col); } },
    null,
    { icon: <Trash2 size={13} />, label: 'Delete Row', action: () => { pushHistory('Delete row'); deleteRow(ref.row); } },
    { icon: <ArrowRight size={13} />, label: 'Delete Column', action: () => { pushHistory('Delete column'); deleteColumn(ref.col); } },
    null,
    { icon: <Bold size={13} />, label: 'Bold', shortcut: 'Ctrl+B', action: () => { setRangeFormat({ bold: true }); } },
    { icon: <Italic size={13} />, label: 'Italic', shortcut: 'Ctrl+I', action: () => { setRangeFormat({ italic: true }); } },
    null,
    { icon: <Trash2 size={13} />, label: 'Clear Cell', action: () => { pushHistory('Clear'); setCellValue(contextMenu.cell, null); } },
    null,
    { icon: <Shield size={13} />, label: 'Data Validation', action: () => { useStore.getState().setShowValidationDialog(true); setContextMenu(null); } },
    null,
    {
      icon: <StickyNote size={13} />,
      label: existingNote ? 'Edit Note' : 'Add Note',
      action: openNoteEditor,
    },
    ...(existingNote ? [{
      icon: <Trash2 size={13} />,
      label: 'Remove Note',
      action: () => {
        notesService.removeNote(sheetId, contextMenu.cell);
        setContextMenu(null);
      },
    }] : []),
    null,
    { icon: <span className="text-xs">📊</span>, label: 'Pivot Table', action: () => { useStore.getState().setShowPivotDialog(true); setContextMenu(null); } },
  ];

  // Clamp position so the menu never renders off-screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 220;
  const menuH = noteMode === 'editing' ? 200 : menuItems.length * 30 + 40;
  const left = Math.min(contextMenu.x, vw - menuW - 8);
  const top = Math.min(contextMenu.y, vh - menuH - 8);

  return (
    <div
      className="fixed rounded-xl shadow-xl border py-1.5 z-50 overflow-hidden"
      style={{ left, top, minWidth: menuW, background: 'var(--surface-panel)', borderColor: 'var(--neutral-200)', boxShadow: '0 8px 24px oklch(0.1 0 0 / 0.15), 0 2px 6px oklch(0.1 0 0 / 0.08)' }}
      // Prevent the document click handler from immediately closing the menu
      onClick={(e) => e.stopPropagation()}
      role="menu"
      aria-label={`Context menu for cell ${contextMenu.cell}`}
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
              onClick={() => setContextMenu(null)}
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
            return <div key={i} className="my-1" style={{ borderTop: '1px solid var(--neutral-100)' }} />;
          }
          return (
            <button
              key={i}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs transition-colors"
              style={{ color: 'var(--ink-primary)' }}
              onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-50)'; e.currentTarget.style.color = 'var(--accent-700)' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-primary)' }}
              onClick={item.action}
              role="menuitem"
            >
              <span style={{ color: 'var(--neutral-400)' }}>{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {'shortcut' in item && item.shortcut && (
                <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{item.shortcut}</span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}
