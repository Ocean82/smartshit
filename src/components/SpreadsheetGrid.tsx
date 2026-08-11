import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Check, XCircle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell, cellToRef } from '@/engine/spreadsheet';
import { FormulaAutocomplete } from './FormulaAutocomplete';
import { FindReplaceDialog } from './FindReplaceDialog';
import { SelectionOverlay } from '@/components/SelectionOverlay';
import { getCheckboxToggleValue } from '@/lib/checkbox';
import { findLastDataRow } from '@/lib/sheetSort';
import { columnDataBarPeerValues, columnColorScalePeerValues, columnIconSetPeerValues } from '@/lib/conditionalFormat';
import { findActivePendingPreview } from '@/lib/pendingActionPreview';
import { useTouch } from '@/hooks/useTouch';
import { getCellNotesService } from '@/lib/cellNotes';
import { GridCell } from './grid';
import { useGridViewport } from './grid/GridViewport';
import { useEditingController } from './grid/EditingController';
import { useSelectionManager } from './grid/SelectionManager';

const DEFAULT_CELL_WIDTH = 100;
const CELL_HEIGHT = 28;
const ROW_HEADER_WIDTH = 46;
const COL_HEADER_HEIGHT = 26;

export function SpreadsheetGrid() {
  const {
    setCellValue,
    pushHistory,
    getActiveSheet,
    getComputedValue,
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

  // ─── Viewport (virtualization) ─────────────────────────────────────────────
  // Column width & resize state (must be declared before useGridViewport)
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const resizeStartRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);

  const getColWidth = useCallback((col: number) => {
    return columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [columnWidths, sheet.columnWidths]);

  const viewport = useGridViewport({
    sheet,
    getComputedValue,
    activeFilters,
    getColWidth,
  });

  // Reset local column width overrides when a new workbook is imported.
  // Without this, resize handles from the previous file persist onto the new sheet.
  const workbookId = useStore((s) => s.workbook.id);
  useEffect(() => {
    setColumnWidths({});
  }, [workbookId]);

  // ─── Selection & Editing ───────────────────────────────────────────────────
  const scrollCellIntoView = useCallback((row: number, col: number) => {
    const gridEl = viewport.gridRef.current;
    if (!gridEl) return;
    const CELL_HEIGHT = 28;
    const cellTop = row * CELL_HEIGHT;
    const cellBottom = cellTop + CELL_HEIGHT;
    const { scrollTop, clientHeight } = gridEl;

    // Vertical scroll
    if (cellBottom > scrollTop + clientHeight) {
      gridEl.scrollTop = cellBottom - clientHeight;
    } else if (cellTop < scrollTop) {
      gridEl.scrollTop = cellTop;
    }

    // Horizontal scroll
    let cellLeft = 0;
    for (let i = 0; i < col; i++) cellLeft += getColWidth(i);
    const cellRight = cellLeft + getColWidth(col);
    const { scrollLeft, clientWidth } = gridEl;

    if (cellRight > scrollLeft + clientWidth) {
      gridEl.scrollLeft = cellRight - clientWidth;
    } else if (cellLeft < scrollLeft) {
      gridEl.scrollLeft = cellLeft;
    }
  }, [viewport.gridRef, getColWidth]);

  const selectionManager = useSelectionManager({
    TOTAL_ROWS: viewport.TOTAL_ROWS,
    TOTAL_COLS: viewport.TOTAL_COLS,
    pushHistory,
    setShowFindReplace: (show: boolean) => setShowFindReplace(show),
    findLastDataRow,
    scrollCellIntoView,
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

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleResizeStart = useCallback((col: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStartRef.current = { col, startX: e.clientX, startWidth: getColWidth(col) };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [getColWidth]);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    // Recover if the primary button was released without a pointerup.
    if ((e.buttons & 1) === 0) {
      handleResizeEnd(e);
      return;
    }
    setColumnWidths((prev) => ({
      ...prev,
      [start.col]: Math.max(40, start.startWidth + (e.clientX - start.startX)),
    }));
  }, [handleResizeEnd]);

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
  }, [getComputedValue, getActiveSheet]);

  // Release body styles if the grid unmounts mid-resize.
  useEffect(() => () => {
    resizeStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // ─── Touch support ──────────────────────────────────────────────────────────
  const getScrollOffset = useCallback(() => {
    if (!viewport.gridRef.current) return { scrollTop: 0, scrollLeft: 0 };
    return { scrollTop: viewport.gridRef.current.scrollTop, scrollLeft: viewport.gridRef.current.scrollLeft };
  }, [viewport.gridRef]);

  // Touch hook - wrap handlers to match useTouch signatures
  const { handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel } = useTouch({
    onTap: (row, col) => selectionManager.handleCellClick(row, col, { preventDefault: () => {}, nativeEvent: new MouseEvent('click') } as React.MouseEvent),
    onDoubleTap: selectionManager.handleCellDoubleClick,
    onLongPress: (row, col, x, y) => selectionManager.handleContextMenu({ preventDefault: () => {}, clientX: x, clientY: y } as React.MouseEvent, row, col),
    onDragSelect: (row, col) => selectionManager.handleMouseMove(row, col, { buttons: 1 } as React.MouseEvent),
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

  const onGridTouchCancel = useCallback(() => {
    handleTouchCancel();
  }, [handleTouchCancel]);

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
      onTouchCancel={onGridTouchCancel}
      style={{ outline: 'none', userSelect: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {/*
       * Scroll content — sized to the full virtual grid so the scrollbar reflects
       * total content dimensions, even though only visible rows/cols are rendered.
       */}
      <div style={{ width: ROW_HEADER_WIDTH + viewport.totalWidth, height: COL_HEADER_HEIGHT + viewport.totalHeight, position: 'relative' }}>

        {/* ── Sticky column header row ─────────────────────────────────────── */}
        <div
          className="flex"
          style={{
            position: 'sticky',
            top: 0,
            height: COL_HEADER_HEIGHT,
            zIndex: 20,
            width: ROW_HEADER_WIDTH + viewport.totalWidth,
          }}
        >
          {/* Corner cell */}
          <div
            role="columnheader"
            aria-label="Select all"
            className="shrink-0 border-b border-r border-gray-300 bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 font-medium cursor-pointer hover:bg-gray-200 sticky left-0 z-30"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
            onClick={() => useStore.getState().setSelection({ startRow: 0, startCol: 0, endRow: 9999, endCol: 9999 })}
          >
            ▾
          </div>

          {/* Spacer for columns scrolled off to the left */}
          {viewport.visibleColOffsets.baseOffset > 0 && (
            <div style={{ width: viewport.visibleColOffsets.baseOffset, height: COL_HEADER_HEIGHT, flexShrink: 0 }} />
          )}

          {/* Visible column headers */}
          {Array.from({ length: viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1 }, (_, j) => {
            const col = viewport.visibleRange.startCol + j;
            const isColSelected = selectionManager.selection &&
              col >= Math.min(selectionManager.selection.startCol, selectionManager.selection.endCol) &&
              col <= Math.max(selectionManager.selection.startCol, selectionManager.selection.endCol);
            return (
              <div
                key={col}
                role="columnheader"
                aria-colindex={col + 2}
                className={`relative group shrink-0 border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors ${
                  isColSelected
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-gradient-to-b from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={{ width: getColWidth(col), height: COL_HEADER_HEIGHT }}
                onClick={() => selectionManager.handleColSelect(col)}
              >
                {colToLetter(col)}
                {activeSortConfig?.column === col && (
                  <span className="ml-0.5 text-blue-500 text-[9px]">{activeSortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                )}
                {activeFilters.some((f) => f.column === col) && (
                  <span className="ml-0.5 text-amber-500 text-[9px]">⏷</span>
                )}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 z-10 touch-none"
                  onPointerDown={(e) => handleResizeStart(col, e)}
                  onPointerMove={handleResizeMove}
                  onPointerUp={handleResizeEnd}
                  onPointerCancel={handleResizeEnd}
                  onDoubleClick={(e) => { e.stopPropagation(); handleAutoFitColumn(col); }}
                />
              </div>
            );
          })}
        </div>

        {/* ── Virtualized data rows ────────────────────────────────────────── */}
        {/*
         * Top spacer pushes visible rows to their correct vertical position
         * without rendering the invisible rows above them.
         */}
        <div style={{ height: viewport.rowOffset }} aria-hidden="true" />

        {Array.from({ length: viewport.visibleRange.endRow - viewport.visibleRange.startRow + 1 }, (_, i) => {
          const displayIndex = viewport.visibleRange.startRow + i;
          const row = viewport.filteredRows ? viewport.filteredRows[displayIndex] : displayIndex;
          if (row == null) return null;
          const isRowSelected = selectionManager.selection &&
            row >= Math.min(selectionManager.selection.startRow, selectionManager.selection.endRow) &&
            row <= Math.max(selectionManager.selection.startRow, selectionManager.selection.endRow);

          return (
            <div
              key={`${displayIndex}-${row}`}
              className="flex"
              role="row"
              aria-rowindex={row + 2}
              style={{ height: CELL_HEIGHT }}
            >
              {/* Sticky row-number gutter */}
              <div
                role="rowheader"
                aria-colindex={1}
                className={`shrink-0 border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors sticky left-0 z-10 ${
                  isRowSelected
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT }}
                onClick={() => selectionManager.handleRowSelect(row)}
              >
                {row + 1}
              </div>

              {/* Spacer for columns scrolled off to the left */}
              {viewport.visibleColOffsets.baseOffset > 0 && (
                <div style={{ width: viewport.visibleColOffsets.baseOffset, height: CELL_HEIGHT, flexShrink: 0 }} />
              )}

              {/* Visible cells */}
              {Array.from({ length: viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1 }, (_, j) => {
                const col = viewport.visibleRange.startCol + j;
                const cellId = refToCell(row, col);
                const selected = selectionManager.isSelected(row, col);
                const active = selectionManager.isActiveCell(row, col);
                const crosshair = !active && !selected && selectionManager.selection != null &&
                  (row === selectionManager.selection.startRow || col === selectionManager.selection.startCol);
                const isEditingCell = editingController.editingCell === cellId;

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
                    isEditing={isEditingCell}
                    isActive={active}
                    isSelected={selected}
                    isCrosshair={crosshair}
                    editValue={editingController.editValue}
                    hasNote={notesService.hasNote(sheet.id, cellId)}
                    noteText={notesService.getNote(sheet.id, cellId)?.text ?? ''}
                    pendingChange={pendingPreview?.changeByCell.get(cellId) ?? null}
                    dataBarPeers={dataBarPeersByCol.get(col) ?? []}
                    colorScalePeers={colorScalePeersByCol.get(col) ?? []}
                    iconSetPeers={iconSetPeersByCol.get(col) ?? []}
                    editContainerRef={editingController.editContainerRef}
                    inputRef={editingController.inputRef}
                    onMouseDown={selectionManager.handleMouseDown}
                    onMouseMove={selectionManager.handleMouseMove}
                    onDoubleClick={selectionManager.handleCellDoubleClick}
                    onContextMenu={selectionManager.handleContextMenu}
                    onEditChange={editingController.setEditValue}
                    onEditBlur={editingController.commitEdit}
                    onCheckboxToggle={(cid, cd) => {
                      pushHistory('Toggle checkbox');
                      setCellValue(cid, getCheckboxToggleValue(cd));
                    }}
                  />
                );
              })}
            </div>
          );
        })}

        {/* Selection overlay — rendered on top of all cells */}
        <SelectionOverlay
          getColWidth={getColWidth}
          totalCols={viewport.TOTAL_COLS}
          cellHeight={CELL_HEIGHT}
          rowHeaderWidth={ROW_HEADER_WIDTH}
          colHeaderHeight={COL_HEADER_HEIGHT}
        />

        {/* Freeze pane indicators */}
        {sheet.frozenRows != null && sheet.frozenRows > 0 && (
          <div className="absolute pointer-events-none z-[8]" style={{ top: sheet.frozenRows * CELL_HEIGHT + COL_HEADER_HEIGHT, left: 0, right: 0, height: 2, backgroundColor: '#3b82f6', opacity: 0.6 }} />
        )}
        {sheet.frozenCols != null && sheet.frozenCols > 0 && (
          <div className="absolute pointer-events-none z-[8]" style={{ top: 0, left: (() => { let w = ROW_HEADER_WIDTH; for (let c = 0; c < (sheet.frozenCols ?? 0); c++) w += getColWidth(c); return w; })(), bottom: 0, width: 2, backgroundColor: '#3b82f6', opacity: 0.6 }} />
        )}
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
            <span className="font-medium text-emerald-100 truncate">{pendingPreview.action.description}</span>
            <span className="ml-2 text-emerald-200">({pendingPreview.changes.length} cell{pendingPreview.changes.length === 1 ? '' : 's'})</span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white text-emerald-800 rounded-lg hover:bg-emerald-50 transition-colors" onClick={() => applyAction(pendingPreview.action.id)}>
              <Check size={12} /> Apply
            </button>
            <button type="button" className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-900/40 text-white rounded-lg border border-emerald-400/50 hover:bg-emerald-900/60 transition-colors" onClick={() => rejectAction(pendingPreview.action.id)}>
              <XCircle size={12} /> Reject
            </button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {selectionManager.selection && `Cell ${colToLetter(selectionManager.selection.startCol)}${selectionManager.selection.startRow + 1} selected`}
      </div>
    </div>
  );
}