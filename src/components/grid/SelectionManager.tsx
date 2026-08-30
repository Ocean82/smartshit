/**
 * SelectionManager - Handles range selection, keyboard navigation, and multi-range selection.
 * Extracted from SpreadsheetGrid to isolate selection logic.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
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

  const {
    sheet,
    selection,
    additionalSelections,
    setSelection,
    setEditingCell,
    setEditValue,
  } = useStore(useShallow((s) => ({
    sheet: s.getActiveSheet(),
    selection: s.selection,
    additionalSelections: s.additionalSelections,
    setSelection: s.setSelection,
    setEditingCell: s.setEditingCell,
    setEditValue: s.setEditValue,
  })));
  const isDragging = useRef(false);
  /** Removes document/window listeners registered for the active drag. */
  const stopDragCleanupRef = useRef<(() => void) | null>(null);

  const endDrag = useCallback(() => {
    isDragging.current = false;
    const cleanup = stopDragCleanupRef.current;
    if (!cleanup) return;
    stopDragCleanupRef.current = null;
    cleanup();
  }, []);

  useEffect(() => () => { endDrag(); }, [endDrag]);

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
    // Don't clear editingCell here — let the input's onBlur handler (commitEdit)
    // handle the commit and cleanup. This prevents a race condition where
    // editingCell is nulled before onBlur fires, causing the edit to be lost.
  }, [selection, setSelection]);

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
        setEditingCell(cellId);
        setEditValue(cellData?.formula || String(cellData?.value ?? ''));
        setSelection({ startRow: r, startCol: c, endRow: r, endCol: c });
        break;
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          const cellId = refToCell(r, c);
          setEditingCell(cellId);
          setEditValue(e.key);
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
  }, [selection, sheet, TOTAL_ROWS, TOTAL_COLS, findLastDataRow, pushHistory, setSelection, setShowFindReplace, scrollCellIntoView, setEditingCell, setEditValue]);

  const handleMouseDown = useCallback((row: number, col: number, e: MouseEvent) => {
    if (e.button !== 0) return;

    // Drop any leftover listeners from a previous incomplete drag before starting a new one.
    endDrag();
    isDragging.current = true;
    handleCellClick(row, col, e);

    // Stop drag when the button is released outside the grid, or when focus/visibility
    // is lost (alt-tab, window blur) so mouseup may never arrive.
    const onMouseUp = () => endDrag();
    const onBlur = () => endDrag();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') endDrag();
    };
    const onPointerCancel = () => endDrag();

    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pointercancel', onPointerCancel);

    stopDragCleanupRef.current = () => {
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [handleCellClick, endDrag]);

  const handleMouseMove = useCallback((row: number, col: number, e: MouseEvent) => {
    // Guard: only extend selection while the primary (left) button bit is set.
    // buttons is a bitmask (1=left, 2=right, 4=middle); use & 1 so left+other still counts
    // as an active drag. This recovers when mouseup was missed (focus loss, context menu, etc.).
    if (!isDragging.current || !selection) return;
    if ((e.buttons & 1) === 0) {
      endDrag();
      return;
    }
    setSelection({
      startRow: selection.startRow,
      startCol: selection.startCol,
      endRow: row,
      endCol: col,
    });
  }, [selection, setSelection, endDrag]);

  const handleMouseUp = useCallback(() => {
    endDrag();
  }, [endDrag]);

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
      setEditingCell(cellId);
      setEditValue(cellData?.formula || String(cellData?.value ?? ''));
      setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    },
    handleKeyDown,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    getSelectionInfo,
    handleColSelect: (col: number) => setSelection({ startRow: 0, startCol: col, endRow: TOTAL_ROWS - 1, endCol: col }),
    handleRowSelect: (row: number) => setSelection({ startRow: row, startCol: 0, endRow: row, endCol: TOTAL_COLS - 1 }),
    setEditingCell,
    setEditValue,
    setSelection,
  };
}