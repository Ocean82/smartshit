/**
 * GoToCellDialog — Navigate to a specific cell via Ctrl+G.
 *
 * Pattern inspired by Univer's scroll-manager service: parses a cell reference
 * and scrolls the viewport to bring it into view.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { cellToRef } from '@/engine/spreadsheet';
import { X } from 'lucide-react';

interface GoToCellDialogProps {
  open: boolean;
  onClose: () => void;
}

export function GoToCellDialog({ open, onClose }: GoToCellDialogProps) {
  const { setSelection } = useStore();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setValue('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSubmit = useCallback(() => {
    const cleaned = value.trim().toUpperCase();
    if (!cleaned) {
      onClose();
      return;
    }

    // Support single cell (A1) or range (A1:C5)
    const rangeMatch = cleaned.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    const cellMatch = cleaned.match(/^([A-Z]+)(\d+)$/);

    if (rangeMatch) {
      const start = cellToRef(`${rangeMatch[1]}${rangeMatch[2]}`);
      const end = cellToRef(`${rangeMatch[3]}${rangeMatch[4]}`);
      setSelection({ startRow: start.row, startCol: start.col, endRow: end.row, endCol: end.col });
      scrollToCell(start.row, start.col);
      onClose();
    } else if (cellMatch) {
      const ref = cellToRef(cleaned);
      setSelection({ startRow: ref.row, startCol: ref.col, endRow: ref.row, endCol: ref.col });
      scrollToCell(ref.row, ref.col);
      onClose();
    } else {
      setError('Invalid cell reference. Use format: A1, B10, or A1:C5');
    }
  }, [value, setSelection, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [handleSubmit, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-start justify-center p-4 md:pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} style={{ background: 'oklch(0.1 0.02 250 / 0.4)', backdropFilter: 'blur(2px)' }} />
      {/* Dialog */}
      <div
        className="relative rounded-t-2xl md:rounded-xl shadow-2xl border w-80 max-w-[calc(100vw-2rem)] p-4 animate-slide-up"
        style={{ background: 'var(--surface-panel)', borderColor: 'var(--neutral-200)', boxShadow: '0 24px 48px oklch(0.1 0 0 / 0.18), 0 4px 12px oklch(0.1 0 0 / 0.08)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="goto-dialog-title"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="goto-dialog-title" className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>Go to Cell</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-lg transition-colors"
            style={{ color: 'var(--neutral-400)' }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Cell reference (e.g. A1, B10, A1:C5)"
            className="w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors focus:ring-2 font-mono"
            style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }}
          />
          {error && <p className="text-[11px]" style={{ color: 'var(--error)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg border transition-colors"
              style={{ color: 'var(--ink-secondary)', borderColor: 'var(--neutral-200)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-3 py-1.5 text-xs text-white rounded-lg transition-colors font-medium"
              style={{ background: 'var(--accent-600)' }}
            >
              Go
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function scrollToCell(row: number, col: number) {
  const gridEl = document.querySelector('[data-spreadsheet-grid]');
  if (!gridEl) return;
  const cellHeight = 28;
  const defaultCellWidth = 100;
  gridEl.scrollTo({
    top: Math.max(0, row * cellHeight - cellHeight * 3),
    left: Math.max(0, col * defaultCellWidth - defaultCellWidth * 2),
    behavior: 'smooth',
  });
}
