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
  visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  filteredRows: number[] | null;
  rowOffsets: number[];
  totalWidth: number;
  totalHeight: number;
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

  // Dynamic grid bounds
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

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!activeFilters.length) return null;
    const last = Math.max(findLastDataRow(sheet), findHeaderRow(sheet));
    return buildFilteredRowIndex(last + 1, activeFilters, getComputedValue, findHeaderRow(sheet));
  }, [activeFilters, getComputedValue, sheet]);

  const displayRowCount = filteredRows ? filteredRows.length : TOTAL_ROWS;

  // Variable row heights: derive a height per displayed row (honoring imported
  // `sheet.rowHeights` overrides) and the cumulative vertical offsets.
  const rowOffsets = useMemo(() => {
    const count = filteredRows ? filteredRows.length : TOTAL_ROWS;
    const heights = new Array<number>(count);
    for (let r = 0; r < count; r++) {
      const actualRow = filteredRows ? filteredRows[r] : r;
      heights[r] = getRowHeight(sheet.rowHeights, actualRow);
    }
    return rowCumulativeOffsets(heights);
  }, [filteredRows, sheet.rowHeights, TOTAL_ROWS]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const { scrollTop, scrollLeft, viewportHeight, viewportWidth } = scrollState;
    const lastRow = rowOffsets.length - 2;
    const startRow = Math.max(0, rowIndexAtY(rowOffsets, scrollTop) - BUFFER_ROWS);
    const endRow = Math.min(lastRow, rowIndexAtY(rowOffsets, scrollTop + viewportHeight) + BUFFER_ROWS);
    
    let colStart = 0;
    let accWidth = 0;
    for (let i = 0; i < TOTAL_COLS; i++) {
      if (accWidth + getColWidth(i) >= scrollLeft) {
        colStart = Math.max(0, i - BUFFER_COLS);
        break;
      }
      accWidth += getColWidth(i);
    }
    
    let colEnd = colStart;
    accWidth = 0;
    for (let i = colStart; i < TOTAL_COLS; i++) {
      accWidth += getColWidth(i);
      if (accWidth > viewportWidth) {
        colEnd = Math.min(TOTAL_COLS - 1, i + BUFFER_COLS);
        break;
      }
      colEnd = i;
    }
    
    return { startRow, endRow, startCol: colStart, endCol: colEnd };
  }, [scrollState, getColWidth, TOTAL_COLS, rowOffsets]);

  // Total dimensions
  const totalWidth = useMemo(() => {
    let width = 0;
    for (let i = 0; i < TOTAL_COLS; i++) {
      width += getColWidth(i);
    }
    return width;
  }, [getColWidth, TOTAL_COLS]);

  const totalHeight = rowOffsets.length > 0 ? rowOffsets[rowOffsets.length - 1] : 0;
  const rowOffset = rowOffsets.length > 0 ? rowOffsets[visibleRange.startRow] : 0;

  // Column offsets for visible columns
  const visibleColOffsets = useMemo(() => {
    const offsets: number[] = [0];
    let accWidth = 0;
    for (let i = 0; i < visibleRange.startCol; i++) {
      accWidth += getColWidth(i);
    }
    for (let i = visibleRange.startCol; i <= visibleRange.endCol; i++) {
      offsets.push(offsets[offsets.length - 1] + getColWidth(i));
    }
    return { offsets, baseOffset: accWidth };
  }, [visibleRange.startCol, visibleRange.endCol, getColWidth]);

  const handleScroll = useCallback(() => {
    if (!gridRef.current) return;
    const { scrollTop, scrollLeft, clientHeight, clientWidth } = gridRef.current;
    setScrollState({ scrollTop, scrollLeft, viewportHeight: clientHeight, viewportWidth: clientWidth });
  }, []);

  // Attach scroll listener
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
    visibleRange,
    filteredRows,
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