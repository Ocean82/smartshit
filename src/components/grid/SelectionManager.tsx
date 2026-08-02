/**
 * SelectionManager - Handles range selection, keyboard navigation, and multi-range selection.
 * Extracted from SpreadsheetGrid to isolate selection logic.
 */

import { useCallback, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useStore } from '@/store/useStore';
import { cellToRef, refToCell, colToLetter } from '@/engine/spreadsheet';
import { isInMultiSelection } from '@/lib/selection';
import type { SheetData } from '@/types';

interface SelectionManagerConfig {
  TOTAL_ROWS: number;
  TOTAL_COLS: number;
  pushHistory: (desc: string) => void;
  setShowFindReplace: (show: boolean) => void;
  findLastDataRow: (sheet: SheetData) => number;
  scrollCellIntoView?: (row: number, col: number) => void;
}

export function useSelectionManager(config: SelectionManagerConfig) {
  const {
    TOTAL_ROWS,
    TOTAL_COLS,
    pushHistory,
    setShowFindReplace,
    findLastDataRow,
    scrollCellIntoView,
  } = config;

  const sheet = useStore.getState().getActiveSheet();
  const selection = useStore(s => s.selection);
  const additionalSelections = useStore(s => s.additionalSelections);
  const setSelection = useStore(s => s.setSelection);
  const editingCell = useStore(s => s.editingCell);
  const isDragging = useRef(false);

  const isSelected = useCallback((row: number, col: number) => {
    if (!selection) return false;
    return isInMultiSelection(row, col, { primary: selection, additional: additionalSelections });
  }, [selection, additionalSelections]);

  const isActiveCell = useCallback((row: number, col: number) => {
    return selection?.startRow === row && selection?.startCol === col;
  }, [selection]);

  const isCrosshair = useCallback((row: number, col: number) => {
    return !isActiveCell(row, col) && !isSelected(row, col) && selection != null &&
      (row === selection.startRow || col === selection.startCol);
  }, [selection, isActiveCell, isSelected]);

  const handleCellClick = useCallback((row: number, col: number, e: MouseEvent) => {
    if (e.shiftKey && selection) {
      setSelection({
        startRow: selection.startRow,
        startCol: selection.startCol,
        endRow: row,
        endCol: col,
      });
    } else if ((e.ctrlKey || e.metaKey) && selection) {
      // Ctrl+click: add a new disjoint range
      const state = useStore.getState();
      state.addSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    } else {
      setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    }
    if (editingCell) useStore.getState().setEditingCell(null);
  }, [selection, setSelection, editingCell]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (useStore.getState().editingCell) {
      // Handled by EditingController
      return;
    }

    if (!selection) return;
    const { startRow: r, startCol: c } = selection;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      pushHistory('Delete cells');
      const minR = Math.min(selection.startRow, selection.endRow);
      const maxR = Math.max(selection.startRow, selection.endRow);
      const minC = Math.min(selection.startCol, selection.endCol);
      const maxC = Math.max(selection.startCol, selection.endCol);
      for (let row = minR; row <= maxR; row++) {
        for (let col = minC; col <= maxC; col++) {
          useStore.getState().setCellValue(refToCell(row, col), null);
        }
      }
      return;
    }

    const navigate = (nr: number, nc: number, shift: boolean) => {
      if (shift) {
        setSelection({ ...selection, endRow: nr, endCol: nc });
      } else {
        setSelection({ startRow: nr, startCol: nc, endRow: nr, endCol: nc });
      }
      scrollCellIntoView?.(nr, nc);
    };

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow - 1 : Math.max(0, r - 1), e.shiftKey ? selection.endCol : c, e.shiftKey);
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow + 1 : r + 1, e.shiftKey ? selection.endCol : c, e.shiftKey);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow : r, e.shiftKey ? Math.max(0, selection.endCol - 1) : Math.max(0, c - 1), e.shiftKey);
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow : r, e.shiftKey ? selection.endCol + 1 : c + 1, e.shiftKey);
        break;
      case 'Enter':
      case 'F2': {
        e.preventDefault();
        const cellId = refToCell(r, c);
        const cellData = useStore.getState().getActiveSheet().cells[cellId];
        useStore.getState().setEditingCell(cellId);
        useStore.getState().setEditValue(cellData?.formula || String(cellData?.value ?? ''));
        setSelection({ startRow: r, startCol: c, endRow: r, endCol: c });
        break;
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const cellId = refToCell(r, c);
          useStore.getState().setEditingCell(cellId);
          useStore.getState().setEditValue(e.key);
          setSelection({ startRow: r, startCol: c, endRow: r, endCol: c });
        }
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'z': e.preventDefault(); useStore.getState().undo(); break;
            case 'y': e.preventDefault(); useStore.getState().redo(); break;
            case 'c': e.preventDefault(); useStore.getState().copy(); break;
            case 'x': e.preventDefault(); useStore.getState().cut(); break;
            case 'v': e.preventDefault(); useStore.getState().paste(); break;
            case 'a': e.preventDefault(); setSelection({ startRow: 0, startCol: 0, endRow: TOTAL_ROWS - 1, endCol: TOTAL_COLS - 1 }); break;
            case 'f':
            case 'h': e.preventDefault(); setShowFindReplace(true); break;
            case 'End': {
              e.preventDefault();
              const lastRow = findLastDataRow(sheet);
              const lastCol = Object.keys(sheet.cells).reduce((max, cid) => {
                const ref = cellToRef(cid);
                return ref ? Math.max(max, ref.col) : max;
              }, 0);
              setSelection({ startRow: lastRow, startCol: lastCol, endRow: lastRow, endCol: lastCol });
              break;
            }
            case 'Home': {
              e.preventDefault();
              setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
              break;
            }
            case 'b': {
              e.preventDefault();
              const cellId = refToCell(r, c);
              const currentBold = sheet.cells[cellId]?.format?.bold ?? false;
              useStore.getState().setRangeFormat({ bold: !currentBold });
              break;
            }
            case 'i': {
              e.preventDefault();
              const cellId = refToCell(r, c);
              const currentItalic = sheet.cells[cellId]?.format?.italic ?? false;
              useStore.getState().setRangeFormat({ italic: !currentItalic });
              break;
            }
          }
        }
    }
  }, [selection, sheet, TOTAL_ROWS, TOTAL_COLS, findLastDataRow, pushHistory, setSelection, setShowFindReplace]);

  const handleMouseDown = useCallback((row: number, col: number, e: MouseEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    handleCellClick(row, col, e);

    // Listen for mouseup on document to stop dragging even if mouse leaves grid
    const stopDrag = () => {
      isDragging.current = false;
      document.removeEventListener('mouseup', stopDrag);
    };
    document.addEventListener('mouseup', stopDrag);
  }, [handleCellClick]);

  const handleMouseMove = useCallback((row: number, col: number) => {
    if (!isDragging.current || !selection) return;
    setSelection({
      startRow: selection.startRow,
      startCol: selection.startCol,
      endRow: row,
      endCol: col,
    });
  }, [selection, setSelection]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleContextMenu = useCallback((e: MouseEvent, row: number, col: number) => {
    e.preventDefault();
    useStore.getState().setContextMenu({ x: e.clientX, y: e.clientY, cell: refToCell(row, col) });
  }, []);

  const getSelectionInfo = useMemo(() => {
    if (!selection) return null;
    const { startRow, startCol, endRow, endCol } = selection;
    const start = `${colToLetter(startCol)}${startRow + 1}`;
    const end = startRow === endRow && startCol === endCol
      ? ''
      : `:${colToLetter(endCol)}${endRow + 1}`;
    const rows = Math.abs(endRow - startRow) + 1;
    const cols = Math.abs(endCol - startCol) + 1;
    return { start, end, rows, cols, range: `${start}${end}`.trim() };
  }, [selection]);

  return {
    selection,
    additionalSelections,
    isSelected,
    isActiveCell,
    isCrosshair,
    handleCellClick,
    handleCellDoubleClick: (row: number, col: number) => {
      const cellId = refToCell(row, col);
      const cellData = sheet.cells[cellId];
      useStore.getState().setEditingCell(cellId);
      useStore.getState().setEditValue(cellData?.formula || String(cellData?.value ?? ''));
      setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    },
    handleKeyDown,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    getSelectionInfo,
    handleColSelect: (col: number) => setSelection({ startRow: 0, startCol: col, endRow: 9999, endCol: col }),
    handleRowSelect: (row: number) => setSelection({ startRow: row, startCol: 0, endRow: row, endCol: 9999 }),
    setEditingCell: useStore.getState().setEditingCell,
    setEditValue: useStore.getState().setEditValue,
    setSelection,
  };
}