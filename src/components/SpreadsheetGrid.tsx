import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Check, XCircle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell, cellToRef } from '@/engine/spreadsheet';
import { FormulaAutocomplete } from './FormulaAutocomplete';
import { FindReplaceDialog } from './FindReplaceDialog';
import { SelectionOverlay } from '@/components/SelectionOverlay';
import type { CellFormat } from '@/types';
import { getBorderCSS, isNegativeRedFormat } from '@/lib/formatUtils';
import { buildFilteredRowIndex } from '@/lib/rowFilter';
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort';
import { columnDataBarPeerValues, columnColorScalePeerValues, columnIconSetPeerValues } from '@/lib/conditionalFormat';
import { findActivePendingPreview } from '@/lib/pendingActionPreview';
import { useTouch } from '@/hooks/useTouch';
import { getCellNotesService } from '@/lib/cellNotes';
import { GridCell } from './grid';
import { GridHeaders } from './grid/GridHeaders';
import { useGridViewport } from './grid/GridViewport';
import { useEditingController } from './grid/EditingController';
import { useSelectionManager } from './grid/SelectionManager';

/** Check if a cell value represents the "checked" state for a checkbox validation. */
function isCellChecked(value: string | number | boolean | null | undefined, checkedValue?: string): boolean {
  const checked = checkedValue ?? 'TRUE'
  const current = String(value ?? '').toUpperCase()
  return current === checked.toUpperCase() || current === '1' || current === 'YES' || current === 'TRUE'
}

const DEFAULT_CELL_WIDTH = 100;
const CELL_HEIGHT = 28;
const ROW_HEADER_WIDTH = 46;
const COL_HEADER_HEIGHT = 26;
const MAX_ROWS = 10000;
const MAX_COLS = 100;
const EMPTY_ROWS_BUFFER = 50; // Extra empty rows shown below data
const EMPTY_COLS_BUFFER = 10; // Extra empty cols shown beyond data
const BUFFER_ROWS = 5;
const BUFFER_COLS = 3;

export function SpreadsheetGrid() {
  const {
    selection,
    additionalSelections,
    editingCell,
    editValue,
    setSelection,
    addSelection,
    setEditingCell,
    setEditValue,
    setCellValue,
    pushHistory,
    getActiveSheet,
    getComputedValue,
    setContextMenu,
    activeFilters,
    activeSortConfig,
    messages,
    applyAction,
    rejectAction,
  } = useStore();

  const sheet = getActiveSheet();
  const notesService = getCellNotesService();

  const pendingPreview = useMemo(
    () => findActivePendingPreview(messages),
    [messages],
  );

  // ─── Conditional format peer caches ─────────────────────────────────────────
  const conditionalCols = useMemo(() => {
    const dataBar = new Set<number>()
    const colorScale = new Set<number>()
    const iconSet = new Set<number>()
    for (const cellId of Object.keys(sheet.cells)) {
      const cell = sheet.cells[cellId]
      const rules = cell?.format?.conditionalRules
      if (!rules) continue
      const col = cellToRef(cellId).col
      for (const r of rules) {
        if (r.type === 'dataBar') dataBar.add(col)
        else if (r.type === 'colorScale') colorScale.add(col)
        else if (r.type === 'iconSet') iconSet.add(col)
      }
    }
    return { dataBar, colorScale, iconSet }
  }, [sheet.cells]);

  /** Build a fingerprint of computed values for a set of columns. */
  const buildColFingerprint = useCallback((cols: Set<number>) => {
    if (cols.size === 0) return ''
    const parts: string[] = []
    for (const cellId of Object.keys(sheet.cells)) {
      const ref = cellToRef(cellId)
      if (cols.has(ref.col)) {
        parts.push(`${cellId}:${getComputedValue(ref.row, ref.col)}`)
      }
    }
    return parts.join('|')
  }, [sheet.cells, getComputedValue]);

  const dataBarFingerprint = useMemo(
    () => buildColFingerprint(conditionalCols.dataBar),
    [buildColFingerprint, conditionalCols.dataBar],
  );
  const colorScaleFingerprint = useMemo(
    () => buildColFingerprint(conditionalCols.colorScale),
    [buildColFingerprint, conditionalCols.colorScale],
  );
  const iconSetFingerprint = useMemo(
    () => buildColFingerprint(conditionalCols.iconSet),
    [buildColFingerprint, conditionalCols.iconSet],
  );

  // Cache data-bar peer values per column
  const dataBarPeersByCol = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const col of conditionalCols.dataBar) {
      map.set(col, columnDataBarPeerValues(sheet, col, getComputedValue))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataBarFingerprint]);

  // Cache color-scale peer values per column
  const colorScalePeersByCol = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const col of conditionalCols.colorScale) {
      map.set(col, columnColorScalePeerValues(sheet, col, getComputedValue))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorScaleFingerprint]);

  // Cache icon-set peer values per column
  const iconSetPeersByCol = useMemo(() => {
    const map = new Map<number, number[]>()
    for (const col of conditionalCols.iconSet) {
      map.set(col, columnIconSetPeerValues(sheet, col, getComputedValue))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconSetFingerprint]);

  const filteredRows = useMemo(() => {
    if (!activeFilters.length) return null;
    const last = Math.max(findLastDataRow(sheet), findHeaderRow(sheet));
    return buildFilteredRowIndex(
      last + 1,
      activeFilters,
      (row, col) => getComputedValue(row, col),
      findHeaderRow(sheet),
    );
  }, [activeFilters, getComputedValue, sheet]);

  // ─── Viewport (virtualization) ─────────────────────────────────────────────
  // Column width & resize state (must be declared before useGridViewport)
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [showFindReplace, setShowFindReplace] = useState(false);

  const getColWidth = useCallback((col: number) => {
    return columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [columnWidths, sheet.columnWidths]);

  const viewport = useGridViewport({
    sheet,
    getComputedValue,
    columnWidths: sheet.columnWidths,
    activeFilters,
    activeSortConfig,
    getColWidth,
  });

  // ─── Selection & Editing ───────────────────────────────────────────────────
  const selectionManager = useSelectionManager({
    TOTAL_ROWS: viewport.TOTAL_ROWS,
    TOTAL_COLS: viewport.TOTAL_COLS,
    pushHistory,
    setShowFindReplace: (show: boolean) => setShowFindReplace(show),
    findLastDataRow,
  });

  const editingController = useEditingController({
    setEditingCell: selectionManager.setEditingCell,
    setEditValue: selectionManager.setEditValue,
    setCellValue,
    pushHistory,
    validateCellValue: useStore.getState().validateCellValue,
    setSelection: selectionManager.setSelection,
  });

  // ─── Column resize handlers ─────────────────────────────────────────────────

  // Column resize
  const handleResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol(col);
    setResizeStartX(e.clientX);
    setResizeStartWidth(getColWidth(col));
  }, [getColWidth]);

  // Auto-fit column width based on content
  const handleAutoFitColumn = useCallback((col: number) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    let maxWidth = 40; // minimum width
    // Check header width
    const headerText = colToLetter(col);
    maxWidth = Math.max(maxWidth, ctx.measureText(headerText).width + 24);

    // Check all cells in the column that have data
    const sheet = getActiveSheet();
    for (const [cellId, cellData] of Object.entries(sheet.cells)) {
      const ref = cellToRef(cellId);
      if (ref.col !== col) continue;
      const computed = getComputedValue(ref.row, ref.col);
      const text = computed || String(cellData.value ?? '');
      if (text) {
        const measured = ctx.measureText(text).width + 20; // padding
        maxWidth = Math.max(maxWidth, measured);
      }
    }

    // Cap at a reasonable max
    maxWidth = Math.min(maxWidth, 400);
    setColumnWidths((prev) => ({ ...prev, [col]: Math.ceil(maxWidth) }));
  }, [sheet.cells, getComputedValue]);

  useEffect(() => {
    if (resizingCol === null) return;
    const handleMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      setColumnWidths((prev) => ({ ...prev, [resizingCol]: Math.max(40, resizeStartWidth + diff) }));
    };
    const handleUp = () => setResizingCol(null);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizingCol, resizeStartX, resizeStartWidth]);

  // ─── Touch support ──────────────────────────────────────────────────────────
  const getScrollOffset = useCallback(() => {
    if (!viewport.gridRef.current) return { scrollTop: 0, scrollLeft: 0 };
    return { scrollTop: viewport.gridRef.current.scrollTop, scrollLeft: viewport.gridRef.current.scrollLeft };
  }, [viewport.gridRef]);

  // Touch hook - wrap handlers to match useTouch signatures
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useTouch({
    onTap: (row, col) => selectionManager.handleCellClick(row, col, { preventDefault: () => {}, nativeEvent: new MouseEvent('click') } as React.MouseEvent),
    onDoubleTap: selectionManager.handleCellDoubleClick,
    onLongPress: (row, col, x, y) => selectionManager.handleContextMenu({ preventDefault: () => {}, clientX: x, clientY: y } as React.MouseEvent, row, col),
    onDragSelect: (row, col) => selectionManager.handleMouseMove(row, col),
    onDragEnd: selectionManager.handleMouseUp,
    cellHeight: CELL_HEIGHT,
    rowHeaderWidth: ROW_HEADER_WIDTH,
    colHeaderHeight: COL_HEADER_HEIGHT,
    getColWidth,
    getScrollOffset,
    visibleRange: viewport.visibleRange,
    colOffsets: viewport.visibleColOffsets,
  });

  const onGridTouchStart = useCallback((e: React.TouchEvent) => {
    const rect = viewport.gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleTouchStart(e, rect);
  }, [handleTouchStart, viewport.gridRef]);

  const onGridTouchMove = useCallback((e: React.TouchEvent) => {
    const rect = viewport.gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleTouchMove(e, rect);
  }, [handleTouchMove, viewport.gridRef]);

  const onGridTouchEnd = useCallback((e: React.TouchEvent) => {
    const rect = viewport.gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleTouchEnd(e, rect);
  }, [handleTouchEnd, viewport.gridRef]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={viewport.gridRef}
      data-spreadsheet-grid
      role="grid"
      aria-label="Spreadsheet grid"
      aria-rowcount={viewport.TOTAL_ROWS}
      aria-colcount={viewport.TOTAL_COLS}
      className="flex-1 overflow-auto relative touch-pan-x touch-pan-y"
      tabIndex={0}
      onKeyDown={selectionManager.handleKeyDown}
      onMouseUp={selectionManager.handleMouseUp}
      onTouchStart={onGridTouchStart}
      onTouchMove={onGridTouchMove}
      onTouchEnd={onGridTouchEnd}
      style={{ outline: 'none', userSelect: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ minWidth: ROW_HEADER_WIDTH + viewport.totalWidth + 20, height: viewport.totalHeight + COL_HEADER_HEIGHT }}>
        {/* Selection range overlay */}
        <SelectionOverlay
          getColWidth={getColWidth}
          totalCols={viewport.TOTAL_COLS}
          cellHeight={CELL_HEIGHT}
          rowHeaderWidth={ROW_HEADER_WIDTH}
          colHeaderHeight={COL_HEADER_HEIGHT}
        />
        {/* Freeze pane indicators */}
        {sheet.frozenRows && sheet.frozenRows > 0 && (
          <div
            className="absolute pointer-events-none z-[8]"
            style={{
              top: sheet.frozenRows * CELL_HEIGHT + COL_HEADER_HEIGHT,
              left: 0,
              right: 0,
              height: 2,
              backgroundColor: '#3b82f6',
              opacity: 0.6,
            }}
          />
        )}
        {sheet.frozenCols && sheet.frozenCols > 0 && (
          <div
            className="absolute pointer-events-none z-[8]"
            style={{
              top: 0,
              left: (() => { let w = ROW_HEADER_WIDTH; for (let c = 0; c < (sheet.frozenCols ?? 0); c++) w += getColWidth(c); return w; })(),
              bottom: 0,
              width: 2,
              backgroundColor: '#3b82f6',
              opacity: 0.6,
            }}
          />
        )}
        {/* Column headers - sticky */}
        <GridHeaders
          visibleRange={viewport.visibleRange}
          filteredRows={viewport.filteredRows}
          totalWidth={viewport.totalWidth}
          visibleColOffsets={viewport.visibleColOffsets}
          getColWidth={getColWidth}
          COL_HEADER_HEIGHT={COL_HEADER_HEIGHT}
          ROW_HEADER_WIDTH={ROW_HEADER_WIDTH}
          CELL_HEIGHT={CELL_HEIGHT}
          selection={selectionManager.selection}
          activeSortConfig={activeSortConfig}
          activeFilters={activeFilters}
          handleColSelect={selectionManager.handleColSelect}
          handleRowSelect={selectionManager.handleRowSelect}
          handleResizeStart={handleResizeStart}
          handleAutoFitColumn={handleAutoFitColumn}
          sheet={sheet}
          getComputedValue={getComputedValue}
          rowOffset={viewport.rowOffset}
        />

        {/* Rows - virtualized */}
        <div className="relative" style={{ top: viewport.rowOffset }}>
          {Array.from({ length: Math.max(0, viewport.visibleRange.endRow - viewport.visibleRange.startRow + 1) }, (_, i) => {
            const displayIndex = viewport.visibleRange.startRow + i;
            const row = viewport.filteredRows ? viewport.filteredRows[displayIndex] : displayIndex;
            if (row == null) return null;
            const isRowSelected = selectionManager.selection &&
              row >= Math.min(selectionManager.selection.startRow, selectionManager.selection.endRow) &&
              row <= Math.max(selectionManager.selection.startRow, selectionManager.selection.endRow);
            return (
              <div key={`${displayIndex}-${row}`} className="flex absolute" role="row" aria-rowindex={row + 2} style={{ height: CELL_HEIGHT, top: displayIndex * CELL_HEIGHT }}>
                <div
                  role="rowheader"
                  aria-colindex={1}
                  className={`border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium shrink-0 sticky left-0 z-10 cursor-pointer transition-colors ${
                    isRowSelected
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT, top: displayIndex * CELL_HEIGHT }}
                  onClick={() => selectionManager.handleRowSelect(row)}
                >
                  {row + 1}
                </div>
                <div className="relative" style={{ width: viewport.totalWidth, height: CELL_HEIGHT }}>
                  {Array.from({ length: viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1 }, (_, j) => {
                    const col = viewport.visibleRange.startCol + j;
                    const cellId = refToCell(row, col);
                    const cellData = sheet.cells[cellId];
                    const selected = selectionManager.isSelected(row, col);
                    const active = selectionManager.isActiveCell(row, col);
                    const crosshair = !active && !selected && selectionManager.selection != null &&
                      (row === selectionManager.selection.startRow || col === selectionManager.selection.startCol);
                    const isEditingCell = editingController.editingCell === cellId;
                    const computed = getComputedValue(row, col);
                    const pendingChange = pendingPreview?.changeByCell.get(cellId) ?? null;

                    return (
                      <GridCell
                        key={col}
                        row={row}
                        col={col}
                        cellId={cellId}
                        cellData={sheet.cells[cellId]}
                        computed={getComputedValue(row, col)}
                        colWidth={getColWidth(col)}
                        cellHeight={CELL_HEIGHT}
                        isEditing={editingController.editingCell === cellId}
                        isActive={selectionManager.isActiveCell(row, col)}
                        isSelected={selectionManager.isSelected(row, col)}
                        isCrosshair={crosshair}
                        editValue={editingController.editValue}
                        hasNote={notesService.hasNote(sheet.id, cellId)}
                        noteText={notesService.getNote(sheet.id, cellId)?.text ?? ''}
                        pendingChange={pendingPreview?.changeByCell.get(cellId) ?? null}
                        dataBarPeers={dataBarPeersByCol.get(col) ?? []}
                        colorScalePeers={colorScalePeersByCol.get(col) ?? []}
                        iconSetPeers={iconSetPeersByCol.get(col) ?? []}
                        colOffset={viewport.visibleColOffsets.offsets[j]}
                        editContainerRef={editingController.editContainerRef}
                        inputRef={editingController.inputRef}
                        onMouseDown={selectionManager.handleMouseDown}
                        onMouseMove={selectionManager.handleMouseMove}
                        onDoubleClick={selectionManager.handleCellDoubleClick}
                        onContextMenu={selectionManager.handleContextMenu}
                        onEditChange={editingController.setEditValue}
                        onEditBlur={editingController.commitEdit}
                        onCheckboxToggle={(cid, cd) => {
                          const checked = cd.validation?.checkedValue ?? 'TRUE';
                          const unchecked = cd.validation?.uncheckedValue ?? 'FALSE';
                          const isChecked = cd.value === checked || (typeof cd.value === 'string' && cd.value.toUpperCase() === checked.toUpperCase()) || cd.value === 1 || cd.value === true;
                          pushHistory('Toggle checkbox');
                          setCellValue(cid, isChecked ? unchecked : checked);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <FormulaAutocomplete
        visible={!!editingController.editingCell && editingController.editValue.startsWith('=')}
        editValue={editingController.editValue}
        onSelect={editingController.handleAutocompleteSelect}
        position={editingController.autocompletePos}
      />
      <FindReplaceDialog isOpen={showFindReplace} onClose={() => setShowFindReplace(false)} />

      {pendingPreview && (
        <div className="sticky bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-3 py-2 bg-emerald-700 text-white shadow-lg border-t border-emerald-500">
          <div className="min-w-0 text-xs">
            <span className="font-bold tracking-wide">AI action staged: </span>
            <span className="font-medium text-emerald-100 truncate">
              {pendingPreview.action.description}
            </span>
            <span className="ml-2 text-emerald-200">
              ({pendingPreview.changes.length} cell{pendingPreview.changes.length === 1 ? '' : 's'})
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white text-emerald-800 rounded-lg hover:bg-emerald-50 transition-colors"
              onClick={() => applyAction(pendingPreview.action.id)}
            >
              <Check size={12} />
              Apply
            </button>
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-900/40 text-white rounded-lg border border-emerald-400/50 hover:bg-emerald-900/60 transition-colors"
              onClick={() => rejectAction(pendingPreview.action.id)}
            >
              <XCircle size={12} />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Screen reader live region — announces selection changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {selectionManager.selection && `Cell ${colToLetter(selectionManager.selection.startCol)}${selectionManager.selection.startRow + 1} selected`}
      </div>
    </div>
  );
}