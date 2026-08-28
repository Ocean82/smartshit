/**
 * SelectionOverlay — Renders visible selection rectangles over the grid.
 * 
 * Supports multi-range selection (Ctrl+click) by rendering one rect per range.
 * Uses pointer-events: none so it never blocks grid interaction.
 * Shows:
 * - Blue translucent fill for each selected range (when > 1 cell)
 * - Dashed border for copied/cut range (marching ants)
 */
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Selection } from '@/types';
import { getRowHeight } from '@/lib/rowLayout';

interface SelectionOverlayProps {
  /** Column width getter */
  getColWidth: (col: number) => number;
  /** Total number of columns (optional) */
  totalCols?: number;
  /** Sparse map of per-row height overrides (imported from .xlsx) */
  rowHeights: Record<number, number>;
  /** Row header width constant */
  rowHeaderWidth: number;
  /** Column header height constant */
  colHeaderHeight: number;
}

/** Vertical span [rowsMin, rowsMax] in pixels, honoring variable row heights. */
function rowSpanPx(rowHeights: Record<number, number>, minRow: number, maxRow: number): { top: number; height: number } {
  let top = 0;
  for (let r = 0; r < minRow; r++) top += getRowHeight(rowHeights, r);
  let height = 0;
  for (let r = minRow; r <= maxRow; r++) height += getRowHeight(rowHeights, r);
  return { top, height };
}

function computeRect(
  sel: Selection,
  getColWidth: (col: number) => number,
  rowHeights: Record<number, number>,
): { top: number; left: number; width: number; height: number } | null {
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);
  const minCol = Math.min(sel.startCol, sel.endCol);
  const maxCol = Math.max(sel.startCol, sel.endCol);

  const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
  if (cellCount < 2) return null;

  let left = 0;
  for (let c = 0; c < minCol; c++) left += getColWidth(c);

  let width = 0;
  for (let c = minCol; c <= maxCol; c++) width += getColWidth(c);

  const { top, height } = rowSpanPx(rowHeights, minRow, maxRow);

  return { top, left, width, height };
}

export function SelectionOverlay({
  getColWidth,
  rowHeights,
  rowHeaderWidth,
  colHeaderHeight,
}: SelectionOverlayProps) {
  const { selection, additionalSelections, copiedRange } = useStore();

  // Calculate pixel bounds for all selection ranges
  const selectionRects = useMemo(() => {
    const rects: Array<{ top: number; left: number; width: number; height: number }> = [];
    if (selection) {
      const r = computeRect(selection, getColWidth, rowHeights);
      if (r) rects.push(r);
    }
    for (const sel of additionalSelections) {
      const r = computeRect(sel, getColWidth, rowHeights);
      if (r) rects.push(r);
    }
    return rects;
  }, [selection, additionalSelections, getColWidth, rowHeights]);

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

    const { top, height } = rowSpanPx(rowHeights, minRow, maxRow);

    return { top, left, width, height };
  }, [copiedRange, getColWidth, rowHeights]);

  return (
    <>
      {/* Selection highlights (supports multi-range) */}
      {selectionRects.map((rect, idx) => (
        <div
          key={idx}
          className="absolute pointer-events-none z-[5]"
          style={{
            top: rect.top + colHeaderHeight,
            left: rect.left + rowHeaderWidth,
            width: rect.width,
            height: rect.height,
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '2px solid rgba(59, 130, 246, 0.6)',
            boxSizing: 'border-box',
          }}
        />
      ))}
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
