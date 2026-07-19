/**
 * SelectionOverlay — Renders a visible selection rectangle over the grid.
 * 
 * Inspired by react-spreadsheet's FloatingRect and Selected components.
 * Uses pointer-events: none so it never blocks grid interaction.
 * Shows:
 * - Blue translucent fill for the selected range (when > 1 cell)
 * - Dashed border for copied/cut range (marching ants)
 */
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';

interface SelectionOverlayProps {
  /** Column width getter */
  getColWidth: (col: number) => number;
  /** Total number of columns */
  totalCols: number;
  /** Cell height constant */
  cellHeight: number;
  /** Row header width constant */
  rowHeaderWidth: number;
  /** Column header height constant */
  colHeaderHeight: number;
}

export function SelectionOverlay({
  getColWidth,
  totalCols,
  cellHeight,
  rowHeaderWidth,
  colHeaderHeight,
}: SelectionOverlayProps) {
  const { selection, copiedRange } = useStore();

  // Calculate pixel bounds for the selection range
  const selectionRect = useMemo(() => {
    if (!selection) return null;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);

    // Only show overlay if more than one cell is selected
    const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    if (cellCount < 2) return null;

    let left = 0;
    for (let c = 0; c < minCol; c++) left += getColWidth(c);

    let width = 0;
    for (let c = minCol; c <= maxCol; c++) width += getColWidth(c);

    const top = minRow * cellHeight;
    const height = (maxRow - minRow + 1) * cellHeight;

    return { top, left, width, height };
  }, [selection, getColWidth, cellHeight]);

  // Calculate pixel bounds for copied range (marching ants)
  const copiedRect = useMemo(() => {
    if (!copiedRange) return null;
    const { startRow, endRow, startCol, endCol } = copiedRange;
    const minRow = Math.min(startRow, endRow);
    const maxRow = Math.max(startRow, endRow);
    const minCol = Math.min(startCol, endCol);
    const maxCol = Math.max(startCol, endCol);

    let left = 0;
    for (let c = 0; c < minCol; c++) left += getColWidth(c);

    let width = 0;
    for (let c = minCol; c <= maxCol; c++) width += getColWidth(c);

    const top = minRow * cellHeight;
    const height = (maxRow - minRow + 1) * cellHeight;

    return { top, left, width, height };
  }, [copiedRange, getColWidth, cellHeight]);

  return (
    <>
      {/* Selection highlight */}
      {selectionRect && (
        <div
          className="absolute pointer-events-none z-[5]"
          style={{
            top: selectionRect.top + colHeaderHeight,
            left: selectionRect.left + rowHeaderWidth,
            width: selectionRect.width,
            height: selectionRect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '2px solid rgba(59, 130, 246, 0.6)',
            boxSizing: 'border-box',
          }}
        />
      )}
      {/* Copy/cut marching ants */}
      {copiedRect && (
        <div
          className="absolute pointer-events-none z-[6] animate-marching-ants"
          style={{
            top: copiedRect.top + colHeaderHeight,
            left: copiedRect.left + rowHeaderWidth,
            width: copiedRect.width,
            height: copiedRect.height,
            border: '2px dashed rgba(59, 130, 246, 0.8)',
            boxSizing: 'border-box',
          }}
        />
      )}
    </>
  );
}
