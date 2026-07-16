/**
 * useTouch — Custom hook for touch interactions on the spreadsheet grid.
 * Handles tap-to-select, double-tap-to-edit, long-press for context menu,
 * and touch-drag for multi-cell selection.
 */
import { useCallback, useRef } from 'react';

interface UseTouchOptions {
  onTap: (row: number, col: number) => void;
  onDoubleTap: (row: number, col: number) => void;
  onLongPress: (row: number, col: number, x: number, y: number) => void;
  onDragSelect: (row: number, col: number) => void;
  onDragEnd: () => void;
  cellHeight: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  getColWidth: (col: number) => number;
  getScrollOffset: () => { scrollTop: number; scrollLeft: number };
  visibleRange: { startRow: number; startCol: number };
  colOffsets: { offsets: number[]; baseOffset: number };
}

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
const MOVE_THRESHOLD = 10; // px — beyond this it's a drag, not a tap

export function useTouch({
  onTap,
  onDoubleTap,
  onLongPress,
  onDragSelect,
  onDragEnd,
  cellHeight,
  rowHeaderWidth,
  colHeaderHeight,
  getColWidth,
  getScrollOffset,
  visibleRange,
  colOffsets,
}: UseTouchOptions) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);
  const lastTapCell = useRef<{ row: number; col: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const didLongPress = useRef(false);

  const getCellFromTouch = useCallback((clientX: number, clientY: number, gridRect: DOMRect): { row: number; col: number } | null => {
    const { scrollTop, scrollLeft } = getScrollOffset();
    const relX = clientX - gridRect.left + scrollLeft - rowHeaderWidth;
    const relY = clientY - gridRect.top + scrollTop - colHeaderHeight;

    if (relX < 0 || relY < 0) return null;

    const row = Math.floor(relY / cellHeight);

    // Find column from accumulated widths
    let accWidth = 0;
    let col = 0;
    for (let i = 0; accWidth < relX; i++) {
      accWidth += getColWidth(i);
      if (accWidth >= relX) {
        col = i;
        break;
      }
      col = i + 1;
    }

    return { row, col };
  }, [cellHeight, rowHeaderWidth, colHeaderHeight, getColWidth, getScrollOffset]);

  const handleTouchStart = useCallback((e: React.TouchEvent, gridRect: DOMRect) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const cell = getCellFromTouch(touch.clientX, touch.clientY, gridRect);
    if (!cell) return;

    touchStart.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = false;
    didLongPress.current = false;

    // Set up long press timer
    longPressTimer.current = setTimeout(() => {
      if (!isDragging.current && cell) {
        didLongPress.current = true;
        onLongPress(cell.row, cell.col, touch.clientX, touch.clientY);
      }
    }, LONG_PRESS_MS);
  }, [getCellFromTouch, onLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent, gridRect: DOMRect) => {
    if (e.touches.length !== 1 || !touchStart.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStart.current.x);
    const dy = Math.abs(touch.clientY - touchStart.current.y);

    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
      // Cancel long press if we moved too much
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      // If user already tapped (selected a cell) and now drags, extend selection
      if (!didLongPress.current) {
        isDragging.current = true;
        const cell = getCellFromTouch(touch.clientX, touch.clientY, gridRect);
        if (cell) {
          onDragSelect(cell.row, cell.col);
        }
      }
    }
  }, [getCellFromTouch, onDragSelect]);

  const handleTouchEnd = useCallback((e: React.TouchEvent, gridRect: DOMRect) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (isDragging.current) {
      isDragging.current = false;
      onDragEnd();
      touchStart.current = null;
      return;
    }

    if (didLongPress.current) {
      touchStart.current = null;
      return;
    }

    // It was a tap — determine single or double tap
    const touch = e.changedTouches[0];
    const cell = getCellFromTouch(touch.clientX, touch.clientY, gridRect);
    if (!cell) {
      touchStart.current = null;
      return;
    }

    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    const sameCell = lastTapCell.current?.row === cell.row && lastTapCell.current?.col === cell.col;

    if (timeSinceLastTap < DOUBLE_TAP_MS && sameCell) {
      // Double tap
      onDoubleTap(cell.row, cell.col);
      lastTapTime.current = 0;
      lastTapCell.current = null;
    } else {
      // Single tap
      onTap(cell.row, cell.col);
      lastTapTime.current = now;
      lastTapCell.current = cell;
    }

    touchStart.current = null;
  }, [getCellFromTouch, onTap, onDoubleTap, onDragEnd]);

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
}
