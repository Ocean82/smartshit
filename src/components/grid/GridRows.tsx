/**
 * GridRows - Virtualized row rendering for the spreadsheet grid.
 * Extracted from SpreadsheetGrid to isolate row rendering logic.
 */

import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell, cellToRef } from '@/engine/spreadsheet';
import { GridCell } from './GridCell';
import { SelectionOverlay } from '../SelectionOverlay';

interface GridRowsProps {
  visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  filteredRows: number[] | null;
  displayRowCount: number;
  rowOffset: number;
  totalWidth: number;
  visibleColOffsets: { offsets: number[]; baseOffset: number };
  getColWidth: (col: number) => number;
  CELL_HEIGHT: number;
  ROW_HEADER_WIDTH: number;
  COL_HEADER_HEIGHT: number;
  sheet: any;
  selection: any;
  additionalSelections: any[];
  editingCell: string | null;
  editValue: string;
  activeFilters: any[];
  activeSortConfig: any;
  getComputedValue: (row: number, col: number) => string;
  dataBarPeersByCol: Map<number, number[]>;
  colorScalePeersByCol: Map<number, number[]>;
  iconSetPeersByCol: Map<number, number[]>;
  notesService: any;
  pendingPreview: any;
  pendingChangeByCell: Map<string, any>;
  editContainerRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<HTMLInputElement>;
  onMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  onMouseMove: (row: number, col: number) => void;
  onDoubleClick: (row: number, col: number) => void;
  onContextMenu: (e: React.MouseEvent, row: number, col: number) => void;
  onEditChange: (val: string) => void;
  onEditBlur: () => void;
  onCheckboxToggle: (cellId: string, cellData: any) => void;
  applyAction: (actionId: string) => void;
  rejectAction: (actionId: string) => void;
}

export function GridRows({
  visibleRange,
  filteredRows,
  displayRowCount,
  rowOffset,
  totalWidth,
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
  activeFilters,
  activeSortConfig,
  getComputedValue,
  dataBarPeersByCol,
  colorScalePeersByCol,
  iconSetPeersByCol,
  notesService,
  pendingPreview,
  pendingChangeByCell,
  editContainerRef,
  inputRef,
  onMouseDown,
  onMouseMove,
  onDoubleClick,
  onContextMenu,
  onEditChange,
  onEditBlur,
  onCheckboxToggle,
  applyAction,
  rejectAction,
}: GridRowsProps) {
  const handleRowSelect = (row: number) => {
    useStore.getState().setSelection({ startRow: row, startCol: 0, endRow: row, endCol: 9999 });
  };

  const isSelected = (row: number, col: number) => {
    if (!selection) return false;
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    if (row >= minR && row <= maxR && col >= minC && col <= maxC) return true;
    for (const sel of additionalSelections) {
      const r0 = Math.min(sel.startRow, sel.endRow);
      const r1 = Math.max(sel.startRow, sel.endRow);
      const c0 = Math.min(sel.startCol, sel.endCol);
      const c1 = Math.max(sel.startCol, sel.endCol);
      if (row >= r0 && row <= r1 && col >= c0 && col <= c1) return true;
    }
    return false;
  };

  const isActiveCell = (row: number, col: number) => {
    return selection?.startRow === row && selection?.startCol === col;
  };

  const isCrosshair = (row: number, col: number) => {
    return !isActiveCell(row, col) && !isSelected(row, col) && selection != null &&
      (row === selection.startRow || col === selection.startCol);
  };

  // Grid rows
  const rows = useMemo(() => {
    const rows: React.ReactElement[] = [];
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
           * Cell container — mirrors GridHeaders' positioning strategy exactly:
           * positioned at baseOffset so that each GridCell's colOffset (which is
           * relative to baseOffset) lands on the correct pixel.
           */}
          <div
            className="absolute"
            style={{
              left: visibleColOffsets.baseOffset,
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
                  colOffset={visibleColOffsets.offsets[j]}
                  editContainerRef={isEditingCell ? editContainerRef : undefined}
                  inputRef={isEditingCell ? inputRef : undefined}
                  onMouseDown={onMouseDown}
                  onMouseMove={onMouseMove}
                  onDoubleClick={onDoubleClick}
                  onContextMenu={onContextMenu}
                  onEditChange={onEditChange}
                  onEditBlur={onEditBlur}
                  onCheckboxToggle={(cid, cd) => {
                    const checked = cd.validation?.checkedValue ?? 'TRUE';
                    const unchecked = cd.validation?.uncheckedValue ?? 'FALSE';
                    const isChecked = cd.value === checked || (typeof cd.value === 'string' && cd.value.toUpperCase() === checked.toUpperCase()) || cd.value === 1 || cd.value === true;
                    useStore.getState().pushHistory('Toggle checkbox');
                    useStore.getState().setCellValue(cid, isChecked ? unchecked : checked);
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
    displayRowCount,
    selection,
    additionalSelections,
    editingCell,
    editValue,
    activeFilters,
    activeSortConfig,
    getComputedValue,
    dataBarPeersByCol,
    colorScalePeersByCol,
    iconSetPeersByCol,
    notesService,
    pendingPreview,
    pendingChangeByCell,
    editContainerRef,
    inputRef,
    visibleColOffsets,
    getColWidth,
    sheet,
    CELL_HEIGHT,
    ROW_HEADER_WIDTH,
    handleRowSelect,
    onMouseDown,
    onMouseMove,
    onDoubleClick,
    onContextMenu,
    onEditChange,
    onEditBlur,
    onCheckboxToggle,
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