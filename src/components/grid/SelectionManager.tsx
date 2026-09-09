/**
 * SelectionManager - Handles range selection, keyboard navigation, and multi-range selection.
 * Extracted from SpreadsheetGrid to isolate selection logic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/store/useStore';
import { cellToRef, refToCell, colToLetter } from '@/engine/spreadsheet';
import { isInMultiSelection } from '@/lib/selection';
import { buildMergeIndex, isMergeAnchor, type MergeRange } from '@/lib/merge';
import type { SheetData } from '@/types';

interface SelectionManagerConfig {
  TOTAL_ROWS: number;
  TOTAL_COLS: number;
  pushHistory: (desc: string) => void;
  setShowFindReplace: (show: boolean) => void;
  findLastDataRow: (sheet: SheetData) => number;
  scrollCellIntoView?: (row: number, col: number) => void;
  /** Called after editing starts from a cell activation so callers can focus the
   * editor input while still inside the user gesture (iOS suppresses the keyboard
   * for programmatic focus that lands outside the gesture window). */
  onEditStart?: () => void;
  /** Map a viewport client point to a cell (supplied by SpreadsheetGrid for the fill drag). */
  pointToCellInViewport?: (clientX: number, clientY: number) => { row: number; col: number };
}

export function useSelectionManager(config: SelectionManagerConfig) {
  const {
    TOTAL_ROWS,
    TOTAL_COLS,
    pushHistory,
    setShowFindReplace,
    findLastDataRow,
    scrollCellIntoView,
    onEditStart,
    pointToCellInViewport,
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

  const isFillDragging = useRef(false);
  const fillTargetRef = useRef<{ row: number; col: number } | null>(null);
  const [fillTarget, setFillTarget] = useState<{ row: number; col: number } | null>(null);
  /** Removes document/window listeners registered for the active fill drag. */
  const fillCleanupRef = useRef<(() => void) | null>(null);

  const mergeIndex = useMemo(() => buildMergeIndex(sheet.mergedCells), [sheet.mergedCells]);

  /** Resolve the merge covering (row, col); returns its bounds or null. */
  const getMergeAtCell = useCallback((row: number, col: number): MergeRange | null => {
    return mergeIndex.byCell.get(refToCell(row, col)) ?? null;
  }, [mergeIndex]);

  /** Map a (possibly covered) cell to the active cell Excel would use for it. */
  const anchorFor = useCallback((row: number, col: number): { row: number; col: number; merge: MergeRange | null } => {
    const merge = getMergeAtCell(row, col);
    if (merge && !isMergeAnchor(mergeIndex, row, col)) {
      return { row: merge.startRow, col: merge.startCol, merge };
    }
    return { row, col, merge };
  }, [getMergeAtCell, mergeIndex]);

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
    const merge = getMergeAtCell(row, col);
    const sel = merge
      ? { startRow: merge.startRow, startCol: merge.startCol, endRow: merge.endRow, endCol: merge.endCol }
      : { startRow: row, startCol: col, endRow: row, endCol: col };
    if (e.shiftKey && selection) {
      // Shift+click: extend the anchor corner to the merge's far bounds.
      const er = merge ? merge.endRow : row;
      const ec = merge ? merge.endCol : col;
      setSelection({
        startRow: selection.startRow,
        startCol: selection.startCol,
        endRow: er,
        endCol: ec,
      });
    } else if ((e.ctrlKey || e.metaKey) && selection) {
      // Ctrl+click: add a new disjoint range (whole merge if one is under the cursor)
      const state = useStore.getState();
      state.addSelection(sel);
    } else {
      setSelection(sel);
    }
    // Don't clear editingCell here — let the input's onBlur handler (commitEdit)
    // handle the commit and cleanup. This prevents a race condition where
    // editingCell is nulled before onBlur fires, causing the edit to be lost.
  }, [selection, setSelection, getMergeAtCell]);

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

    const navigate = (nr: number, nc: number, shift: boolean, dir: 'up' | 'down' | 'left' | 'right') => {
      // Skip over whole merged regions when the landing cell is part of one.
      const merge = getMergeAtCell(nr, nc);
      if (merge) {
        switch (dir) {
          case 'right': nc = Math.min(TOTAL_COLS - 1, merge.endCol + 1); break;
          case 'left': nc = Math.max(0, merge.startCol - 1); break;
          case 'down': nr = Math.min(TOTAL_ROWS - 1, merge.endRow + 1); break;
          case 'up': nr = Math.max(0, merge.startRow - 1); break;
        }
      }
      if (shift) {
        setSelection({ ...selection, endRow: nr, endCol: nc });
      } else {
        setSelection({ startRow: nr, startCol: nc, endRow: nr, endCol: nc });
      }
      scrollCellIntoView?.(nr, nc);
    };

    const startEditing = (initialValue?: string) => {
      e.preventDefault();
      const { row: ar, col: ac, merge } = anchorFor(r, c);
      const cellId = refToCell(ar, ac);
      const cellData = useStore.getState().getActiveSheet().cells[cellId];
      setEditingCell(cellId);
      setEditValue(initialValue ?? (cellData?.formula || String(cellData?.value ?? '')));
      setSelection(merge
        ? { startRow: merge.startRow, startCol: merge.startCol, endRow: merge.endRow, endCol: merge.endCol }
        : { startRow: r, startCol: c, endRow: r, endCol: c });
    };

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow - 1 : Math.max(0, r - 1), e.shiftKey ? selection.endCol : c, e.shiftKey, 'up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow + 1 : r + 1, e.shiftKey ? selection.endCol : c, e.shiftKey, 'down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow : r, e.shiftKey ? Math.max(0, selection.endCol - 1) : Math.max(0, c - 1), e.shiftKey, 'left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigate(e.shiftKey ? selection.endRow : r, e.shiftKey ? selection.endCol + 1 : c + 1, e.shiftKey, 'right');
        break;
      case 'Enter':
      case 'F2': {
        startEditing();
        break;
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          startEditing(e.key);
        }
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'z': e.preventDefault(); useStore.getState().undo(); break;
            case 'y': e.preventDefault(); useStore.getState().redo(); break;
            case 'c': e.preventDefault(); useStore.getState().copy(); break;
            case 'x': e.preventDefault(); useStore.getState().cut(); break;
            case 'v': e.preventDefault(); void useStore.getState().pasteFromClipboard(); break;
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
            case '5': {
              e.preventDefault();
              const cellId = refToCell(r, c);
              const currentStrike = sheet.cells[cellId]?.format?.strikethrough ?? false;
              useStore.getState().setRangeFormat({ strikethrough: !currentStrike });
              break;
            }
          }
        }
    }
  }, [selection, sheet, TOTAL_ROWS, TOTAL_COLS, findLastDataRow, pushHistory, setSelection, setShowFindReplace, scrollCellIntoView, setEditingCell, setEditValue, getMergeAtCell, anchorFor]);

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

  const updateFillTarget = useCallback((clientX: number, clientY: number) => {
    if (!pointToCellInViewport) return;
    const t = pointToCellInViewport(clientX, clientY);
    fillTargetRef.current = t;
    setFillTarget(t);
  }, [pointToCellInViewport]);

  const endFillDrag = useCallback((commit: boolean) => {
    const cleanup = fillCleanupRef.current;
    fillCleanupRef.current = null;
    if (cleanup) cleanup();
    isFillDragging.current = false;
    const target = fillTargetRef.current;
    fillTargetRef.current = null;
    setFillTarget(null);
    if (commit && target) useStore.getState().autofillTo(target.row, target.col);
  }, []);

  const handleFillPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    endDrag();          // drop any selection drag state
    endFillDrag(false); // drop a prior unfinished fill drag
    isFillDragging.current = true;

    const onPointerMove = (ev: globalThis.PointerEvent) => updateFillTarget(ev.clientX, ev.clientY);
    const onPointerUp = () => endFillDrag(true);
    const onBlur = () => endFillDrag(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') endFillDrag(false);
    };
    const onPointerCancel = () => endFillDrag(false);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pointercancel', onPointerCancel);

    fillCleanupRef.current = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [endDrag, endFillDrag, updateFillTarget]);

  // Clean up a dangling fill drag on unmount.
  useEffect(() => () => { endFillDrag(false); }, [endFillDrag]);

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
      const { row: ar, col: ac, merge } = anchorFor(row, col);
      const cellId = refToCell(ar, ac);
      const cellData = sheet.cells[cellId];
      setEditingCell(cellId);
      setEditValue(cellData?.formula || String(cellData?.value ?? ''));
      setSelection(merge
        ? { startRow: merge.startRow, startCol: merge.startCol, endRow: merge.endRow, endCol: merge.endCol }
        : { startRow: ar, startCol: ac, endRow: ar, endCol: ac });
      onEditStart?.();
    },
    handleKeyDown,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleContextMenu,
    handleFillPointerDown,
    fillTarget,
    getSelectionInfo,
    handleColSelect: (col: number) => setSelection({ startRow: 0, startCol: col, endRow: TOTAL_ROWS - 1, endCol: col }),
    handleRowSelect: (row: number) => setSelection({ startRow: row, startCol: 0, endRow: row, endCol: TOTAL_COLS - 1 }),
    setEditingCell,
    setEditValue,
    setSelection,
  };
}