/**
 * GridViewport - Handles virtual scrolling and visible range calculation.
 * Extracted from SpreadsheetGrid to isolate virtualization logic.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction, UIEvent } from 'react';
import { cellToRef } from '@/engine/spreadsheet';
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort';
import { buildFilteredRowIndex } from '@/lib/rowFilter';
import { getRowHeight, rowCumulativeOffsets, rowIndexAtY } from '@/lib/rowLayout';
import { computeFreezeBodyWindow } from '@/lib/gridFreeze';
import { buildVisibleColIndices, buildVisibleRowIndices } from '@/lib/rowColVisibility';
import type { SheetData, FilterConfig } from '@/types';

const BUFFER_ROWS = 5;
const BUFFER_COLS = 3;
const MAX_ROWS = 10000;
const MAX_COLS = 100;
const EMPTY_ROWS_BUFFER = 50;
const EMPTY_COLS_BUFFER = 10;

interface GridViewportConfig {
  sheet: SheetData;
  getComputedValue: (row: number, col: number) => string;
  activeFilters: FilterConfig[];
  getColWidth: (col: number) => number;
}

interface ScrollState {
  scrollTop: number;
  scrollLeft: number;
  viewportHeight: number;
  viewportWidth: number;
}

interface GridViewportReturn {
  gridRef: RefObject<HTMLDivElement | null>;
  TOTAL_ROWS: number;
  TOTAL_COLS: number;
  displayRowCount: number;
  displayColCount: number;
  /** Body virtualization window (excludes frozen rows/cols — those render separately). */
  visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  frozenRows: number;
  frozenCols: number;
  /** Visible sheet row indices (filter + hide). Null = identity 0..TOTAL_ROWS-1. */
  displayRows: number[] | null;
  /** Visible sheet col indices (hide). Null = identity 0..TOTAL_COLS-1. */
  displayCols: number[] | null;
  /** @deprecated alias of displayRows for callers that still say filteredRows */
  filteredRows: number[] | null;
  rowOffsets: number[];
  totalWidth: number;
  totalHeight: number;
  /** Spacer height between the frozen row block and the body window. */
  rowOffset: number;
  visibleColOffsets: { offsets: number[]; baseOffset: number };
  scrollState: ScrollState;
  setScrollState: Dispatch<SetStateAction<ScrollState>>;
  handleScroll: () => void;
  onGridScroll: (e: UIEvent<HTMLDivElement>) => void;
}

export function useGridViewport(config: GridViewportConfig): GridViewportReturn {
  const { sheet, getComputedValue, activeFilters, getColWidth } = config;

  const gridRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({ scrollTop: 0, scrollLeft: 0, viewportHeight: 600, viewportWidth: 800 });

  const { TOTAL_ROWS, TOTAL_COLS } = useMemo(() => {
    const lastDataRow = findLastDataRow(sheet);
    const lastDataCol = Object.keys(sheet.cells).reduce((max, cellId) => {
      const ref = cellToRef(cellId);
      return ref ? Math.max(max, ref.col) : max;
    }, 0);
    return {
      TOTAL_ROWS: Math.min(MAX_ROWS, Math.max(100, lastDataRow + EMPTY_ROWS_BUFFER + 1)),
      TOTAL_COLS: Math.min(MAX_COLS, Math.max(26, lastDataCol + EMPTY_COLS_BUFFER + 1)),
    };
  }, [sheet]);

  const filteredRows = useMemo(() => {
    if (!activeFilters.length) return null;
    const last = Math.max(findLastDataRow(sheet), findHeaderRow(sheet));
    return buildFilteredRowIndex(last + 1, activeFilters, getComputedValue, findHeaderRow(sheet));
  }, [activeFilters, getComputedValue, sheet]);

  const displayRows = useMemo(
    () => buildVisibleRowIndices(TOTAL_ROWS, filteredRows, sheet.hiddenRows),
    [TOTAL_ROWS, filteredRows, sheet.hiddenRows],
  );

  const displayCols = useMemo(
    () => buildVisibleColIndices(TOTAL_COLS, sheet.hiddenCols),
    [TOTAL_COLS, sheet.hiddenCols],
  );

  const displayRowCount = displayRows ? displayRows.length : TOTAL_ROWS;
  const displayColCount = displayCols ? displayCols.length : TOTAL_COLS;

  const rowOffsets = useMemo(() => {
    const count = displayRowCount;
    const heights = new Array<number>(count);
    for (let r = 0; r < count; r++) {
      const actualRow = displayRows ? displayRows[r] : r;
      heights[r] = getRowHeight(sheet.rowHeights, actualRow);
    }
    return rowCumulativeOffsets(heights);
  }, [displayRows, displayRowCount, sheet.rowHeights]);

  const displayColWidth = useCallback((displayCol: number) => {
    const actual = displayCols ? displayCols[displayCol] : displayCol;
    return getColWidth(actual);
  }, [displayCols, getColWidth]);

  // Body window starts after freeze. frozenRows/frozenCols count the first N
  // *display* indices (post-filter / post-hide), matching what stays pinned.
  const { visibleRange, frozenRows, frozenCols } = useMemo(() => {
    const { scrollTop, scrollLeft, viewportHeight, viewportWidth } = scrollState;
    const lastRow = rowOffsets.length - 2;
    const naturalStartRow = Math.max(0, rowIndexAtY(rowOffsets, scrollTop) - BUFFER_ROWS);
    const naturalEndRow = Math.min(lastRow, rowIndexAtY(rowOffsets, scrollTop + viewportHeight) + BUFFER_ROWS);

    let colStart = 0;
    let accWidth = 0;
    for (let i = 0; i < displayColCount; i++) {
      if (accWidth + displayColWidth(i) >= scrollLeft) {
        colStart = Math.max(0, i - BUFFER_COLS);
        break;
      }
      accWidth += displayColWidth(i);
    }

    let colEnd = colStart;
    accWidth = 0;
    for (let i = colStart; i < displayColCount; i++) {
      accWidth += displayColWidth(i);
      if (accWidth > viewportWidth) {
        colEnd = Math.min(displayColCount - 1, i + BUFFER_COLS);
        break;
      }
      colEnd = i;
    }

    const window = computeFreezeBodyWindow({
      frozenRows: sheet.frozenRows,
      frozenCols: sheet.frozenCols,
      naturalStartRow,
      naturalEndRow,
      naturalStartCol: colStart,
      naturalEndCol: colEnd,
      displayRowCount,
      totalCols: displayColCount,
    });

    return {
      frozenRows: window.frozenRows,
      frozenCols: window.frozenCols,
      visibleRange: {
        startRow: window.bodyStartRow,
        endRow: window.bodyEndRow,
        startCol: window.bodyStartCol,
        endCol: window.bodyEndCol,
      },
    };
  }, [scrollState, displayColWidth, displayColCount, displayRowCount, rowOffsets, sheet.frozenRows, sheet.frozenCols]);

  const totalWidth = useMemo(() => {
    let width = 0;
    for (let i = 0; i < displayColCount; i++) width += displayColWidth(i);
    return width;
  }, [displayColWidth, displayColCount]);

  const totalHeight = rowOffsets.length > 0 ? rowOffsets[rowOffsets.length - 1] : 0;
  const rowOffset = rowOffsets.length > 0
    ? Math.max(0, (rowOffsets[visibleRange.startRow] ?? 0) - (rowOffsets[frozenRows] ?? 0))
    : 0;

  const visibleColOffsets = useMemo(() => {
    const offsets: number[] = [0];
    let accWidth = 0;
    for (let i = frozenCols; i < visibleRange.startCol; i++) {
      accWidth += displayColWidth(i);
    }
    for (let i = visibleRange.startCol; i <= visibleRange.endCol; i++) {
      offsets.push(offsets[offsets.length - 1] + displayColWidth(i));
    }
    return { offsets, baseOffset: accWidth };
  }, [visibleRange.startCol, visibleRange.endCol, displayColWidth, frozenCols]);

  const handleScroll = useCallback(() => {
    if (!gridRef.current) return;
    const { scrollTop, scrollLeft, clientHeight, clientWidth } = gridRef.current;
    setScrollState({ scrollTop, scrollLeft, viewportHeight: clientHeight, viewportWidth: clientWidth });
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return {
    gridRef,
    TOTAL_ROWS,
    TOTAL_COLS,
    displayRowCount,
    displayColCount,
    visibleRange,
    frozenRows,
    frozenCols,
    displayRows,
    displayCols,
    filteredRows: displayRows,
    rowOffsets,
    totalWidth,
    totalHeight,
    rowOffset,
    visibleColOffsets,
    scrollState,
    setScrollState,
    handleScroll,
    onGridScroll: () => { handleScroll(); },
  };
}
