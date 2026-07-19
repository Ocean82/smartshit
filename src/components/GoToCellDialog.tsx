/**
 * GoToCellDialog — Navigate to a specific cell via Ctrl+G.
 *
 * Pattern inspired by Univer's scroll-manager service: parses a cell reference
 * and scrolls the viewport to bring it into view.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-80 p-4 animate-slide-up">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">Go to Cell</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
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
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 font-mono"
          />
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
