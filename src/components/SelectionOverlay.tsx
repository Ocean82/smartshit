/**
 * SelectionOverlay — Renders visible selection rectangles over the grid.
 *
 * Supports multi-range selection (Ctrl+click) by rendering one rect per range.
 * Uses pointer-events: none so it never blocks grid interaction.
 * Shows:
 * - Blue translucent fill for each selected range (when > 1 visible cell)
 * - Dashed border for copied/cut range (marching ants)
 *
 * Freeze: body quadrant stays content-absolute; freeze-band slices render inside
 * a sticky viewport shell so they stay pinned with frozen cells.
 *
 * Geometry uses display row/col indices so hidden/filtered axes do not inflate
 * overlay position or size.
 */
import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { Selection } from '@/types';
import { getRowHeight } from '@/lib/rowLayout';
import { splitRectAcrossFreeze, type ContentRect } from '@/lib/gridFreeze';
import { visibleContentSpan } from '@/lib/rowColVisibility';

interface SelectionOverlayProps {
  getColWidth: (col: number) => number;
  totalCols?: number;
  totalRows?: number;
  rowHeights: Record<number, number>;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  /** Visible sheet row indices (filter + hide). Null = identity. */
  displayRows?: number[] | null;
  /** Visible sheet col indices (hide). Null = identity. */
  displayCols?: number[] | null;
  frozenRowHeight?: number;
  frozenColWidth?: number;
  scrollTop?: number;
  scrollLeft?: number;
  viewportHeight?: number;
  viewportWidth?: number;
}

function computeRect(
  sel: Selection,
  getColWidth: (col: number) => number,
  rowHeights: Record<number, number>,
  displayRows: number[] | null,
  displayCols: number[] | null,
  totalRows: number,
  totalCols: number,
  opts?: { requireMultiCell?: boolean },
): ContentRect | null {
  const minRow = Math.min(sel.startRow, sel.endRow);
  const maxRow = Math.max(sel.startRow, sel.endRow);
  const minCol = Math.min(sel.startCol, sel.endCol);
  const maxCol = Math.max(sel.startCol, sel.endCol);

  const rowSpan = visibleContentSpan({
    displayIndices: displayRows,
    totalCount: totalRows,
    start: minRow,
    end: maxRow,
    getSize: (r) => getRowHeight(rowHeights, r),
  });
  const colSpan = visibleContentSpan({
    displayIndices: displayCols,
    totalCount: totalCols,
    start: minCol,
    end: maxCol,
    getSize: getColWidth,
  });

  if (!rowSpan || !colSpan) return null;
  if (opts?.requireMultiCell !== false && rowSpan.visibleCount * colSpan.visibleCount < 2) return null;

  return {
    top: rowSpan.offset,
    left: colSpan.offset,
    width: colSpan.size,
    height: rowSpan.size,
  };
}

function frozenBandScreenPos(
  band: ContentRect,
  args: {
    frozenRowHeight: number;
    frozenColWidth: number;
    colHeaderHeight: number;
    rowHeaderWidth: number;
    scrollTop: number;
    scrollLeft: number;
  },
): { top: number; left: number } {
  const inTopBand = band.top < args.frozenRowHeight;
  return {
    top: inTopBand
      ? args.colHeaderHeight + band.top
      : args.colHeaderHeight + band.top - args.scrollTop,
    left: inTopBand
      ? args.rowHeaderWidth + band.left - args.scrollLeft
      : args.rowHeaderWidth + band.left,
  };
}

export function SelectionOverlay({
  getColWidth,
  rowHeights,
  rowHeaderWidth,
  colHeaderHeight,
  totalCols = 26,
  totalRows = 100,
  displayRows = null,
  displayCols = null,
  frozenRowHeight = 0,
  frozenColWidth = 0,
  scrollTop = 0,
  scrollLeft = 0,
  viewportHeight = 600,
  viewportWidth = 800,
}: SelectionOverlayProps) {
  const { selection, additionalSelections, copiedRange } = useStore();
  const hasFreeze = frozenRowHeight > 0 || frozenColWidth > 0;

  const selectionRects = useMemo(() => {
    const rects: ContentRect[] = [];
    if (selection) {
      const r = computeRect(selection, getColWidth, rowHeights, displayRows, displayCols, totalRows, totalCols);
      if (r) rects.push(r);
    }
    for (const sel of additionalSelections) {
      const r = computeRect(sel, getColWidth, rowHeights, displayRows, displayCols, totalRows, totalCols);
      if (r) rects.push(r);
    }
    return rects;
  }, [selection, additionalSelections, getColWidth, rowHeights, displayRows, displayCols, totalRows, totalCols]);

  const copiedRect = useMemo(() => {
    if (!copiedRange) return null;
    return computeRect(
      copiedRange,
      getColWidth,
      rowHeights,
      displayRows,
      displayCols,
      totalRows,
      totalCols,
      { requireMultiCell: false },
    );
  }, [copiedRange, getColWidth, rowHeights, displayRows, displayCols, totalRows, totalCols]);

  const splitSelections = useMemo(
    () => selectionRects.map((rect) => (
      hasFreeze
        ? splitRectAcrossFreeze(rect, { topInset: frozenRowHeight, leftInset: frozenColWidth })
        : { frozen: [] as ContentRect[], body: rect }
    )),
    [selectionRects, hasFreeze, frozenRowHeight, frozenColWidth],
  );

  const splitCopied = useMemo(() => {
    if (!copiedRect) return null;
    return hasFreeze
      ? splitRectAcrossFreeze(copiedRect, { topInset: frozenRowHeight, leftInset: frozenColWidth })
      : { frozen: [] as ContentRect[], body: copiedRect };
  }, [copiedRect, hasFreeze, frozenRowHeight, frozenColWidth]);

  const freezeScreen = {
    frozenRowHeight,
    frozenColWidth,
    colHeaderHeight,
    rowHeaderWidth,
    scrollTop,
    scrollLeft,
  };

  const selStyle = {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    border: '2px solid rgba(59, 130, 246, 0.6)',
    boxSizing: 'border-box' as const,
  };
  const copyStyle = {
    border: '2px dashed rgba(59, 130, 246, 0.8)',
    boxSizing: 'border-box' as const,
  };

  return (
    <>
      {splitSelections.map((parts, idx) => (
        parts.body ? (
          <div
            key={`sel-body-${idx}`}
            className="absolute pointer-events-none z-[5]"
            style={{
              top: parts.body.top + colHeaderHeight,
              left: parts.body.left + rowHeaderWidth,
              width: parts.body.width,
              height: parts.body.height,
              ...selStyle,
            }}
          />
        ) : null
      ))}

      {splitCopied?.body && (
        <div
          className="absolute pointer-events-none z-[6] animate-marching-ants"
          style={{
            top: splitCopied.body.top + colHeaderHeight,
            left: splitCopied.body.left + rowHeaderWidth,
            width: splitCopied.body.width,
            height: splitCopied.body.height,
            ...copyStyle,
          }}
        />
      )}

      {hasFreeze && (
        <div
          className="pointer-events-none z-[13]"
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            width: viewportWidth,
            height: viewportHeight,
            overflow: 'hidden',
          }}
        >
          {splitSelections.map((parts, idx) =>
            parts.frozen.map((band, j) => {
              const pos = frozenBandScreenPos(band, freezeScreen);
              return (
                <div
                  key={`sel-fz-${idx}-${j}`}
                  className="absolute pointer-events-none"
                  style={{
                    top: pos.top,
                    left: pos.left,
                    width: band.width,
                    height: band.height,
                    ...selStyle,
                  }}
                />
              );
            }),
          )}
          {splitCopied?.frozen.map((band, j) => {
            const pos = frozenBandScreenPos(band, freezeScreen);
            return (
              <div
                key={`copy-fz-${j}`}
                className="absolute pointer-events-none animate-marching-ants"
                style={{
                  top: pos.top,
                  left: pos.left,
                  width: band.width,
                  height: band.height,
                  ...copyStyle,
                }}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
