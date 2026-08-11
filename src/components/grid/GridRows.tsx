/**
 * GridRows - Virtualized row rendering for the spreadsheet grid.
 * Extracted from SpreadsheetGrid to isolate row rendering logic.
 */

import { useMemo } from 'react';
import type { MouseEvent, ReactElement, RefObject } from 'react';
import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { getCheckboxToggleValue } from '@/lib/checkbox';
import { isInMultiSelection } from '@/lib/selection';
import type { CellNotesService } from '@/lib/cellNotes';
import type { PendingPreviewAction } from '@/lib/pendingActionPreview';
import type { SheetData, Selection } from '@/types';
import { GridCell } from './GridCell';
import { SelectionOverlay } from '../SelectionOverlay';

interface GridRowsProps {
  visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  filteredRows: number[] | null;
  rowOffset: number;
  visibleColOffsets: { offsets: number[]; baseOffset: number };
  getColWidth: (col: number) => number;
  CELL_HEIGHT: number;
  ROW_HEADER_WIDTH: number;
  COL_HEADER_HEIGHT: number;
  sheet: SheetData;
  selection: Selection | null;
  additionalSelections: Selection[];
  editingCell: string | null;
  editValue: string;
  getComputedValue: (row: number, col: number) => string;
  dataBarPeersByCol: Map<number, number[]>;
  colorScalePeersByCol: Map<number, number[]>;
  iconSetPeersByCol: Map<number, number[]>;
  notesService: CellNotesService;
  pendingPreview: PendingPreviewAction | null;
  editContainerRef: RefObject<HTMLDivElement>;
  inputRef: RefObject<HTMLInputElement>;
  onMouseDown: (row: number, col: number, e: MouseEvent) => void;
  onMouseMove: (row: number, col: number, e: MouseEvent) => void;
  onDoubleClick: (row: number, col: number) => void;
  onContextMenu: (e: MouseEvent, row: number, col: number) => void;
  onEditChange: (val: string) => void;
  onEditBlur: () => void;
}

export function GridRows({
  visibleRange,
  filteredRows,
  rowOffset,
  visibleColOffsets,
  getColWidth,
  CELL_HEIGHT,
  ROW_HEADER_WIDTH,
  COL_HEADER_HEIGHT,
  sheet,
  selection,
  additionalSelections,
  editingCell,
  editValue,
  getComputedValue,
  dataBarPeersByCol,
  colorScalePeersByCol,
  iconSetPeersByCol,
  notesService,
  pendingPreview,
  editContainerRef,
  inputRef,
  onMouseDown,
  onMouseMove,
  onDoubleClick,
  onContextMenu,
  onEditChange,
  onEditBlur,
}: GridRowsProps) {
  // Grid rows
  const rows = useMemo(() => {
    const handleRowSelect = (row: number) => {
      useStore.getState().setSelection({ startRow: row, startCol: 0, endRow: row, endCol: 9999 });
    };

    const isSelected = (row: number, col: number) => {
      if (!selection) return false;
      return isInMultiSelection(row, col, { primary: selection, additional: additionalSelections });
    };

    const isActiveCell = (row: number, col: number) => {
      return selection?.startRow === row && selection?.startCol === col;
    };

    const isCrosshair = (row: number, col: number) => {
      return !isActiveCell(row, col) && !isSelected(row, col) && selection != null &&
        (row === selection.startRow || col === selection.startCol);
    };

    const rows: ReactElement[] = [];
    Array.from({ length: Math.max(0, visibleRange.endRow - visibleRange.startRow + 1) }, (_, i) => {
      const displayIndex = visibleRange.startRow + i;
      const row = filteredRows ? filteredRows[displayIndex] : displayIndex;
      if (row == null) return null;
      const isRowSelected = selection &&
        row >= Math.min(selection.startRow, selection.endRow) &&
        row <= Math.max(selection.startRow, selection.endRow);
      rows.push(
        <div
          key={`${displayIndex}-${row}`}
          className="absolute flex"
          role="row"
          aria-rowindex={row + 2}
          style={{
            height: CELL_HEIGHT,
            top: displayIndex * CELL_HEIGHT,
            // Row header is sticky-left so it must live at left:0.
            // Cells are positioned relative to baseOffset (same as GridHeaders).
            left: 0,
            right: 0,
          }}
        >
          {/* Sticky row-number gutter — always anchored to the left edge */}
          <div
            role="rowheader"
            aria-colindex={1}
            className={`border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium shrink-0 sticky left-0 z-10 cursor-pointer transition-colors ${
              isRowSelected
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT }}
            onClick={() => handleRowSelect(row)}
          >
            {row + 1}
          </div>

          {/*
           * Cell container — positioned at ROW_HEADER_WIDTH + baseOffset.
           * ROW_HEADER_WIDTH skips the sticky row-number gutter.
           * baseOffset skips the columns scrolled off-screen to the left.
           * Each GridCell then uses colOffset (relative to baseOffset) for its
           * final left position, matching how column headers are placed.
           */}
          <div
            className="absolute"
            style={{
              left: ROW_HEADER_WIDTH + visibleColOffsets.baseOffset,
              height: CELL_HEIGHT,
            }}
          >
            {Array.from({ length: visibleRange.endCol - visibleRange.startCol + 1 }, (_, j) => {
              const col = visibleRange.startCol + j;
              const cellId = refToCell(row, col);
              const cellData = sheet.cells[cellId];
              const selected = isSelected(row, col);
              const active = isActiveCell(row, col);
              const isEditingCell = editingCell === cellId;
              const computed = getComputedValue(row, col);
              const pendingChange = pendingPreview?.changeByCell.get(cellId) ?? null;

              return (
                <GridCell
                  key={col}
                  row={row}
                  col={col}
                  cellId={cellId}
                  cellData={cellData}
                  computed={computed}
                  colWidth={getColWidth(col)}
                  cellHeight={CELL_HEIGHT}
                  isEditing={isEditingCell}
                  isActive={active}
                  isSelected={selected}
                  isCrosshair={isCrosshair(row, col)}
                  editValue={editValue}
                  hasNote={notesService.hasNote(sheet.id, cellId)}
                  noteText={notesService.getNote(sheet.id, cellId)?.text ?? ''}
                  pendingChange={pendingChange}
                  dataBarPeers={dataBarPeersByCol.get(col) ?? []}
                  colorScalePeers={colorScalePeersByCol.get(col) ?? []}
                  iconSetPeers={iconSetPeersByCol.get(col) ?? []}
                  editContainerRef={isEditingCell ? editContainerRef : undefined}
                  inputRef={isEditingCell ? inputRef : undefined}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onDoubleClick={onDoubleClick}
                  onContextMenu={onContextMenu}
                  onEditChange={onEditChange}
                  onEditBlur={onEditBlur}
                  onCheckboxToggle={(cid, cd) => {
                    useStore.getState().pushHistory('Toggle checkbox');
                    useStore.getState().setCellValue(cid, getCheckboxToggleValue(cd));
                  }}
                />
              );
            })}
          </div>
        </div>
      );
    });
    return rows;
  }, [
    visibleRange,
    filteredRows,
    selection,
    additionalSelections,
    editingCell,
    editValue,
    getComputedValue,
    dataBarPeersByCol,
    colorScalePeersByCol,
    iconSetPeersByCol,
    notesService,
    pendingPreview,
    editContainerRef,
    inputRef,
    visibleColOffsets,
    getColWidth,
    sheet,
    CELL_HEIGHT,
    ROW_HEADER_WIDTH,
    onMouseDown,
    onMouseMove,
    onDoubleClick,
    onContextMenu,
    onEditChange,
    onEditBlur,
  ]);

  return (
    <>
      {/* Selection range overlay */}
      <SelectionOverlay
        getColWidth={getColWidth}
        totalCols={visibleRange.endCol - visibleRange.startCol + 1}
        cellHeight={CELL_HEIGHT}
        rowHeaderWidth={ROW_HEADER_WIDTH}
        colHeaderHeight={COL_HEADER_HEIGHT}
      />
      {/* Rows */}
      <div className="relative" style={{ top: rowOffset }}>
        {rows}
      </div>
    </>
  );
}