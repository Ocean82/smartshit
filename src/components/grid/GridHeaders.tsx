/**
 * GridHeaders - Column and row header rendering.
 * Extracted from SpreadsheetGrid.
 */

import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import { useStore } from '@/store/useStore';
import { colToLetter } from '@/engine/spreadsheet';
import type { Selection, SortConfig, FilterConfig } from '@/types';

interface GridHeadersProps {
  visibleRange: { startCol: number; endCol: number; startRow: number; endRow: number };
  filteredRows: number[] | null;
  totalWidth: number;
  visibleColOffsets: { offsets: number[]; baseOffset: number };
  getColWidth: (col: number) => number;
  COL_HEADER_HEIGHT: number;
  ROW_HEADER_WIDTH: number;
  CELL_HEIGHT: number;
  selection: Selection | null;
  activeSortConfig: SortConfig | null;
  activeFilters: FilterConfig[];
  handleColSelect: (col: number) => void;
  handleRowSelect: (row: number) => void;
  handleResizeStart: (col: number, e: MouseEvent) => void;
  handleAutoFitColumn: (col: number) => void;
  rowOffset: number;
}

export function GridHeaders({
  visibleRange,
  filteredRows,
  totalWidth,
  visibleColOffsets,
  getColWidth,
  COL_HEADER_HEIGHT,
  ROW_HEADER_WIDTH,
  CELL_HEIGHT,
  selection,
  activeSortConfig,
  activeFilters,
  handleColSelect,
  handleRowSelect,
  handleResizeStart,
  handleAutoFitColumn,
  rowOffset,
}: GridHeadersProps) {
  // Top-left corner header
  const cornerHeader = (
    <div
      role="columnheader"
      className="bg-gradient-to-b from-gray-100 to-gray-150 border-b border-r border-gray-300 flex items-center justify-center text-[10px] text-gray-400 font-medium shrink-0 sticky left-0 z-30"
      style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
      onClick={() => useStore.getState().setSelection({ startRow: 0, startCol: 0, endRow: 9999, endCol: 9999 })}
      aria-label="Select all cells"
    >
      ▾
    </div>
  );

  // Column headers
  const columnHeaders = useMemo(() => (
    <div className="relative" style={{ width: totalWidth, height: COL_HEADER_HEIGHT }}>
      <div className="absolute" style={{ left: visibleColOffsets.baseOffset, top: 0 }}>
        {Array.from({ length: visibleRange.endCol - visibleRange.startCol + 1 }, (_, i) => {
          const col = visibleRange.startCol + i;
          const isColSelected = selection &&
            col >= Math.min(selection.startCol, selection.endCol) &&
            col <= Math.max(selection.startCol, selection.endCol);
          return (
            <div
              key={col}
              role="columnheader"
              aria-colindex={col + 2}
              className={`border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium shrink-0 relative group cursor-pointer transition-colors ${
                isColSelected
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'bg-gradient-to-b from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              style={{ width: getColWidth(col), height: COL_HEADER_HEIGHT, position: 'absolute', left: visibleColOffsets.offsets[i] }}
              onClick={() => handleColSelect(col)}
            >
              {colToLetter(col)}
              {activeSortConfig?.column === col && (
                <span className="ml-0.5 text-blue-500 text-[9px]">{activeSortConfig.direction === 'asc' ? '▲' : '▼'}</span>
              )}
              {activeFilters.some((f) => f.column === col) && (
                <span className="ml-0.5 text-amber-500 text-[9px]">⏷</span>
              )}
              <div
                className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 z-10"
                onMouseDown={(e) => handleResizeStart(col, e)}
                onDoubleClick={(e) => { e.stopPropagation(); handleAutoFitColumn(col); }}
              />
            </div>
          );
        })}
      </div>
    </div>
  ), [visibleRange, visibleColOffsets, selection, activeSortConfig, activeFilters, getColWidth, totalWidth, COL_HEADER_HEIGHT, handleColSelect, handleResizeStart, handleAutoFitColumn]);

  // Row headers
  const rowHeaders = useMemo(() => (
    <div className="relative" style={{ width: ROW_HEADER_WIDTH, top: -rowOffset }}>
      {Array.from({ length: visibleRange.endRow - visibleRange.startRow + 1 }, (_, i) => {
        const displayIndex = visibleRange.startRow + i;
        const row = filteredRows ? filteredRows[displayIndex] : displayIndex;
        if (row == null) return null;
        const isRowSelected = selection &&
          row >= Math.min(selection.startRow, selection.endRow) &&
          row <= Math.max(selection.startRow, selection.endRow);
        return (
          <div
            key={`${displayIndex}-${row}`}
            role="rowheader"
            aria-colindex={1}
            className={`border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium shrink-0 sticky left-0 z-10 cursor-pointer transition-colors ${
              isRowSelected
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT, top: displayIndex * CELL_HEIGHT }}
            onClick={() => handleRowSelect(row)}
          >
            {row + 1}
          </div>
        );
      })}
    </div>
  ), [visibleRange, filteredRows, selection, rowOffset, ROW_HEADER_WIDTH, CELL_HEIGHT, handleRowSelect]);

  return (
    <>
      {cornerHeader}
      {columnHeaders}
      {rowHeaders}
    </>
  );
}