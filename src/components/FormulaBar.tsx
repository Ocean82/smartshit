/**
 * FormulaBar — Dedicated formula/cell reference bar above the spreadsheet grid.
 *
 * Pattern inspired by Univer's FormulaBar: cell name box + formula editor.
 * Shows:
 * - Cell reference (e.g., "A1") or range (e.g., "A1:C3") on the left
 * - Formula/value content on the right (editable)
 * - Cancel (X) and Confirm (✓) buttons when editing
 */
import { useCallback, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell, cellToRef } from '@/engine/spreadsheet';
import { X, Check, FunctionSquare } from 'lucide-react';

export function FormulaBar() {
  const {
    selection,
    editingCell,
    editValue,
    setEditingCell,
    setEditValue,
    setCellValue,
    pushHistory,
    getActiveSheet,
    setSelection,
  } = useStore();

  const sheet = getActiveSheet();
  const inputRef = useRef<HTMLInputElement>(null);
  const nameBoxRef = useRef<HTMLInputElement>(null);
  const [nameBoxValue, setNameBoxValue] = useState('');
  const [nameBoxEditing, setNameBoxEditing] = useState(false);

  // Derive the cell reference label
  const cellRef = (() => {
    if (!selection) return '';
    const { startRow, startCol, endRow, endCol } = selection;
    const start = `${colToLetter(startCol)}${startRow + 1}`;
    if (startRow === endRow && startCol === endCol) return start;
    const end = `${colToLetter(endCol)}${endRow + 1}`;
    return `${start}:${end}`;
  })();

  // Get current cell content for display
  const cellContent = (() => {
    if (editingCell) return editValue;
    if (!selection) return '';
    const cellId = refToCell(selection.startRow, selection.startCol);
    const cellData = sheet.cells[cellId];
    if (cellData?.formula) return cellData.formula;
    if (cellData?.value != null) return String(cellData.value);
    return '';
  })();

  const isEditing = !!editingCell;

  // Handle clicking into the formula bar to start editing
  const handleBarClick = useCallback(() => {
    if (!selection || editingCell) return;
    const cellId = refToCell(selection.startRow, selection.startCol);
    const cellData = sheet.cells[cellId];
    setEditingCell(cellId);
    setEditValue(cellData?.formula || String(cellData?.value ?? ''));
  }, [selection, editingCell, sheet.cells, setEditingCell, setEditValue]);

  // Commit the edit
  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    pushHistory('Edit cell ' + editingCell);
    const val = editValue;
    if (val.startsWith('=')) {
      setCellValue(editingCell, null, val);
    } else {
      const num = Number(val);
      if (val !== '' && !isNaN(num)) {
        setCellValue(editingCell, num);
      } else {
        setCellValue(editingCell, val || null);
      }
    }
    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, pushHistory, setCellValue, setEditingCell, setEditValue]);

  // Cancel the edit
  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, [setEditingCell, setEditValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [commitEdit, cancelEdit]);

  // Name box: Go to Cell
  const handleNameBoxSubmit = useCallback(() => {
    const val = nameBoxValue.trim().toUpperCase();
    if (!val) {
      setNameBoxEditing(false);
      return;
    }
    // Parse cell reference like "A1" or "B10"
    const match = val.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      const ref = cellToRef(val);
      setSelection({ startRow: ref.row, startCol: ref.col, endRow: ref.row, endCol: ref.col });
      // Scroll to the cell
      const gridEl = document.querySelector('[data-spreadsheet-grid]');
      if (gridEl) {
        const cellHeight = 28;
        const defaultCellWidth = 100;
        gridEl.scrollTo({
          top: Math.max(0, ref.row * cellHeight - cellHeight * 2),
          left: Math.max(0, ref.col * defaultCellWidth - defaultCellWidth),
          behavior: 'smooth',
        });
      }
    }
    setNameBoxEditing(false);
  }, [nameBoxValue, setSelection]);

  const handleNameBoxKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNameBoxSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setNameBoxEditing(false);
    }
  }, [handleNameBoxSubmit]);

  return (
    <div className="hidden md:flex h-7 border-b border-gray-200 bg-white items-center gap-0 shrink-0">
      {/* Cell name box (Go to Cell) */}
      <div className="w-[80px] h-full border-r border-gray-200 flex items-center">
        {nameBoxEditing ? (
          <input
            ref={nameBoxRef}
            className="w-full h-full px-2 text-xs font-mono text-center bg-white outline-none border-none"
            value={nameBoxValue}
            onChange={(e) => setNameBoxValue(e.target.value.toUpperCase())}
            onBlur={handleNameBoxSubmit}
            onKeyDown={handleNameBoxKeyDown}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="w-full h-full px-2 text-xs font-mono text-center text-gray-700 hover:bg-blue-50 transition-colors cursor-text"
            onClick={() => {
              setNameBoxEditing(true);
              setNameBoxValue(cellRef);
            }}
            title="Name Box — click to go to a cell (e.g. A1, B10)"
          >
            {cellRef || 'A1'}
          </button>
        )}
      </div>

      {/* Action buttons (show when editing) */}
      <div className="flex items-center gap-0.5 px-1 border-r border-gray-200 h-full">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={cancelEdit}
              className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors"
              title="Cancel (Esc)"
            >
              <X size={13} />
            </button>
            <button
              type="button"
              onClick={commitEdit}
              className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors"
              title="Confirm (Enter)"
            >
              <Check size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="p-1 text-gray-300"><X size={13} /></span>
            <span className="p-1 text-gray-300"><Check size={13} /></span>
          </>
        )}
        <span className="p-1 text-gray-400" title="Function">
          <FunctionSquare size={13} />
        </span>
      </div>

      {/* Formula/value editor area */}
      <div className="flex-1 h-full flex items-center overflow-hidden">
        {isEditing ? (
          <input
            ref={inputRef}
            className="w-full h-full px-2 text-[13px] font-mono text-gray-800 outline-none border-none bg-white"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <div
            className="w-full h-full flex items-center px-2 text-[13px] font-mono text-gray-700 cursor-text hover:bg-blue-50/30 transition-colors truncate"
            onClick={handleBarClick}
            title={cellContent || 'Click to edit'}
          >
            {cellContent || <span className="text-gray-300 italic">Empty</span>}
          </div>
        )}
      </div>
    </div>
  );
}
