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

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CELL_WIDTH = 100;
const CELL_HEIGHT = 28;
const ROW_HEADER_WIDTH = 46;
const COL_HEADER_HEIGHT = 26;
const MIN_COL_WIDTH = 40;
const MAX_COL_WIDTH = 400;
const MEASURE_FONT = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

// ─── Conditional Format Peer Cache Hook ───────────────────────────────────────

interface ConditionalPeerCaches {
  dataBarPeersByCol: Map<number, number[]>;
  colorScalePeersByCol: Map<number, number[]>;
  iconSetPeersByCol: Map<number, number[]>;
}

function useConditionalFormatPeers(
  sheet: ReturnType<typeof useStore.getState>['getActiveSheet'] extends () => infer R ? R : never,
  getComputedValue: (row: number, col: number) => string,
): ConditionalPeerCaches {
  const conditionalCols = useMemo(() => {
    const dataBar = new Set<number>();
    const colorScale = new Set<number>();
    const iconSet = new Set<number>();
    for (const cellId of Object.keys(sheet.cells)) {
      const cell = sheet.cells[cellId];
      const rules = cell?.format?.conditionalRules;
      if (!rules) continue;
      const col = cellToRef(cellId).col;
      for (const r of rules) {
        if (r.type === 'dataBar') dataBar.add(col);
        else if (r.type === 'colorScale') colorScale.add(col);
        else if (r.type === 'iconSet') iconSet.add(col);
      }
    }
    return { dataBar, colorScale, iconSet };
  }, [sheet.cells]);

  const buildColFingerprint = useCallback((cols: Set<number>) => {
    if (cols.size === 0) return '';
    const parts: string[] = [];
    for (const cellId of Object.keys(sheet.cells)) {
      const ref = cellToRef(cellId);
      if (cols.has(ref.col)) {
        parts.push(`${cellId}:${getComputedValue(ref.row, ref.col)}`);
      }
    }
    return parts.join('|');
  }, [sheet.cells, getComputedValue]);

  const dataBarFingerprint = useMemo(() => buildColFingerprint(conditionalCols.dataBar), [buildColFingerprint, conditionalCols.dataBar]);
  const colorScaleFingerprint = useMemo(() => buildColFingerprint(conditionalCols.colorScale), [buildColFingerprint, conditionalCols.colorScale]);
  const iconSetFingerprint = useMemo(() => buildColFingerprint(conditionalCols.iconSet), [buildColFingerprint, conditionalCols.iconSet]);

  const dataBarPeersByCol = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const col of conditionalCols.dataBar) map.set(col, columnDataBarPeerValues(sheet, col, getComputedValue));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataBarFingerprint]);

  const colorScalePeersByCol = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const col of conditionalCols.colorScale) map.set(col, columnColorScalePeerValues(sheet, col, getComputedValue));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorScaleFingerprint]);

  const iconSetPeersByCol = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const col of conditionalCols.iconSet) map.set(col, columnIconSetPeerValues(sheet, col, getComputedValue));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconSetFingerprint]);

  return { dataBarPeersByCol, colorScalePeersByCol, iconSetPeersByCol };
}

// ─── Column Resize Hook ───────────────────────────────────────────────────────

function useColumnResize(getColWidth: (col: number) => number, getActiveSheet: () => ReturnType<typeof useStore.getState>['getActiveSheet'] extends () => infer R ? R : never, getComputedValue: (row: number, col: number) => string) {
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const resizeStartRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);

  const workbookId = useStore((s) => s.workbook.id);
  useEffect(() => { setColumnWidths({}); }, [workbookId]);

  useEffect(() => () => {
    resizeStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

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
    if ((e.buttons & 1) === 0) { handleResizeEnd(e); return; }
    setColumnWidths((prev) => ({
      ...prev,
      [start.col]: Math.max(MIN_COL_WIDTH, start.startWidth + (e.clientX - start.startX)),
    }));
  }, [handleResizeEnd]);

  const handleAutoFitColumn = useCallback((col: number) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = MEASURE_FONT;

    let maxWidth = MIN_COL_WIDTH;
    maxWidth = Math.max(maxWidth, ctx.measureText(colToLetter(col)).width + 24);

    const sheet = getActiveSheet();
    for (const [cellId, cellData] of Object.entries(sheet.cells)) {
      const ref = cellToRef(cellId);
      if (ref.col !== col) continue;
      const text = getComputedValue(ref.row, ref.col) || String(cellData.value ?? '');
      if (text) maxWidth = Math.max(maxWidth, ctx.measureText(text).width + 20);
    }

    setColumnWidths((prev) => ({ ...prev, [col]: Math.ceil(Math.min(maxWidth, MAX_COL_WIDTH)) }));
  }, [getComputedValue, getActiveSheet]);

  return { columnWidths, handleResizeStart, handleResizeMove, handleResizeEnd, handleAutoFitColumn };
}

// ─── Touch Adapter Hook ───────────────────────────────────────────────────────

interface TouchAdapterConfig {
  gridRef: React.RefObject<HTMLDivElement | null>;
  selectionManager: ReturnType<typeof useSelectionManager>;
  getColWidth: (col: number) => number;
  visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  visibleColOffsets: { offsets: number[]; baseOffset: number };
}

function useGridTouch({ gridRef, selectionManager, getColWidth, visibleRange, visibleColOffsets }: TouchAdapterConfig) {
  const getScrollOffset = useCallback(() => {
    if (!gridRef.current) return { scrollTop: 0, scrollLeft: 0 };
    return { scrollTop: gridRef.current.scrollTop, scrollLeft: gridRef.current.scrollLeft };
  }, [gridRef]);

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
    visibleRange,
    colOffsets: visibleColOffsets,
  });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (rect) handleTouchStart(e, rect);
  }, [handleTouchStart, gridRef]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (rect) handleTouchMove(e, rect);
  }, [handleTouchMove, gridRef]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (rect) handleTouchEnd(e, rect);
  }, [handleTouchEnd, gridRef]);

  const onTouchCancel = useCallback(() => { handleTouchCancel(); }, [handleTouchCancel]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}

// ─── Freeze Pane Indicator ────────────────────────────────────────────────────

function FreezePaneIndicators({ frozenRows, frozenCols, getColWidth }: { frozenRows?: number | null; frozenCols?: number | null; getColWidth: (col: number) => number }) {
  const frozenColLeft = useMemo(() => {
    if (!frozenCols || frozenCols <= 0) return 0;
    let w = ROW_HEADER_WIDTH;
    for (let c = 0; c < frozenCols; c++) w += getColWidth(c);
    return w;
  }, [frozenCols, getColWidth]);

  return (
    <>
      {frozenRows != null && frozenRows > 0 && (
        <div className="absolute pointer-events-none z-[8]" style={{ top: frozenRows * CELL_HEIGHT + COL_HEADER_HEIGHT, left: 0, right: 0, height: 2, backgroundColor: '#3b82f6', opacity: 0.6 }} />
      )}
      {frozenCols != null && frozenCols > 0 && (
        <div className="absolute pointer-events-none z-[8]" style={{ top: 0, left: frozenColLeft, bottom: 0, width: 2, backgroundColor: '#3b82f6', opacity: 0.6 }} />
      )}
    </>
  );
}

// ─── Pending Action Bar ───────────────────────────────────────────────────────

interface PendingActionBarProps {
  description: string;
  changeCount: number;
  actionId: string;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
}

function PendingActionBar({ description, changeCount, actionId, onApply, onReject }: PendingActionBarProps) {
  return (
    <div className="sticky bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-3 py-2 bg-emerald-700 text-white shadow-lg border-t border-emerald-500">
      <div className="min-w-0 text-xs">
        <span className="font-bold tracking-wide">AI action staged: </span>
        <span className="font-medium text-emerald-100 truncate">{description}</span>
        <span className="ml-2 text-emerald-200">({changeCount} cell{changeCount === 1 ? '' : 's'})</span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button type="button" className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white text-emerald-800 rounded-lg hover:bg-emerald-50 transition-colors" onClick={() => onApply(actionId)}>
          <Check size={12} /> Apply
        </button>
        <button type="button" className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-900/40 text-white rounded-lg border border-emerald-400/50 hover:bg-emerald-900/60 transition-colors" onClick={() => onReject(actionId)}>
          <XCircle size={12} /> Reject
        </button>
      </div>
    </div>
  );
}

// ─── Column Header ────────────────────────────────────────────────────────────

interface ColumnHeaderProps {
  col: number;
  width: number;
  isSelected: boolean;
  sortDirection?: 'asc' | 'desc' | null;
  isFiltered: boolean;
  onSelect: (col: number) => void;
  onResizeStart: (col: number, e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  onAutoFit: (col: number) => void;
}

function ColumnHeader({ col, width, isSelected, sortDirection, isFiltered, onSelect, onResizeStart, onResizeMove, onResizeEnd, onAutoFit }: ColumnHeaderProps) {
  return (
    <div
      role="columnheader"
      aria-colindex={col + 2}
      className={`relative group shrink-0 border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-100 text-blue-700 border-blue-300'
          : 'bg-gradient-to-b from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
      style={{ width, height: COL_HEADER_HEIGHT }}
      onClick={() => onSelect(col)}
    >
      {colToLetter(col)}
      {sortDirection && <span className="ml-0.5 text-blue-500 text-[9px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
      {isFiltered && <span className="ml-0.5 text-amber-500 text-[9px]">⏷</span>}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 z-10 touch-none"
        onPointerDown={(e) => onResizeStart(col, e)}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={(e) => { e.stopPropagation(); onAutoFit(col); }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
    showFindReplace,
    setShowFindReplace,
  } = useStore();

  const sheet = getActiveSheet();
  const notesService = getCellNotesService();

  const pendingPreview = useMemo(() => findActivePendingPreview(messages), [messages]);

  // Conditional format caches
  const { dataBarPeersByCol, colorScalePeersByCol, iconSetPeersByCol } = useConditionalFormatPeers(sheet, getComputedValue);

  // Column widths
  const getColWidth = useCallback((col: number) => {
    return resizeState.columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [sheet.columnWidths]);

  const resizeState = useColumnResize(getColWidth, getActiveSheet, getComputedValue);

  // Reassign getColWidth to use local state (avoids stale closure)
  const resolvedGetColWidth = useCallback((col: number) => {
    return resizeState.columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [resizeState.columnWidths, sheet.columnWidths]);

  // Viewport (virtualization)
  const viewport = useGridViewport({
    sheet,
    getComputedValue,
    activeFilters,
    getColWidth: resolvedGetColWidth,
  });

  // Selection & editing
  const scrollCellIntoView = useCallback((row: number, col: number) => {
    const gridEl = viewport.gridRef.current;
    if (!gridEl) return;
    const cellTop = row * CELL_HEIGHT;
    const cellBottom = cellTop + CELL_HEIGHT;
    const { scrollTop, clientHeight } = gridEl;

    if (cellBottom > scrollTop + clientHeight) gridEl.scrollTop = cellBottom - clientHeight;
    else if (cellTop < scrollTop) gridEl.scrollTop = cellTop;

    let cellLeft = 0;
    for (let i = 0; i < col; i++) cellLeft += resolvedGetColWidth(i);
    const cellRight = cellLeft + resolvedGetColWidth(col);
    const { scrollLeft, clientWidth } = gridEl;

    if (cellRight > scrollLeft + clientWidth) gridEl.scrollLeft = cellRight - clientWidth;
    else if (cellLeft < scrollLeft) gridEl.scrollLeft = cellLeft;
  }, [viewport.gridRef, resolvedGetColWidth]);

  const selectionManager = useSelectionManager({
    TOTAL_ROWS: viewport.TOTAL_ROWS,
    TOTAL_COLS: viewport.TOTAL_COLS,
    pushHistory,
    setShowFindReplace,
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

  // Touch support
  const touch = useGridTouch({
    gridRef: viewport.gridRef,
    selectionManager,
    getColWidth: resolvedGetColWidth,
    visibleRange: viewport.visibleRange,
    visibleColOffsets: viewport.visibleColOffsets,
  });

  // ─── Helpers for selection state ────────────────────────────────────────────

  const isColSelected = useCallback((col: number) => {
    if (!selectionManager.selection) return false;
    return col >= Math.min(selectionManager.selection.startCol, selectionManager.selection.endCol) &&
           col <= Math.max(selectionManager.selection.startCol, selectionManager.selection.endCol);
  }, [selectionManager.selection]);

  const isRowSelected = useCallback((row: number) => {
    if (!selectionManager.selection) return false;
    return row >= Math.min(selectionManager.selection.startRow, selectionManager.selection.endRow) &&
           row <= Math.max(selectionManager.selection.startRow, selectionManager.selection.endRow);
  }, [selectionManager.selection]);

  // Combined keyboard handler: editing keys first, then selection/navigation
  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (useStore.getState().editingCell) {
      editingController.handleKeyDown(e);
      return;
    }
    selectionManager.handleKeyDown(e);
  }, [editingController, selectionManager]);

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
      onKeyDown={handleGridKeyDown}
      onMouseUp={selectionManager.handleMouseUp}
      onTouchStart={touch.onTouchStart}
      onTouchMove={touch.onTouchMove}
      onTouchEnd={touch.onTouchEnd}
      onTouchCancel={touch.onTouchCancel}
      style={{ outline: 'none', userSelect: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ width: ROW_HEADER_WIDTH + viewport.totalWidth, height: COL_HEADER_HEIGHT + viewport.totalHeight, position: 'relative' }}>

        {/* ── Sticky column header row ─────────────────────────────────────── */}
        <div
          className="flex"
          style={{ position: 'sticky', top: 0, height: COL_HEADER_HEIGHT, zIndex: 20, width: ROW_HEADER_WIDTH + viewport.totalWidth }}
        >
          <div
            role="columnheader"
            aria-label="Select all"
            className="shrink-0 border-b border-r border-gray-300 bg-gray-100 flex items-center justify-center text-[10px] text-gray-400 font-medium cursor-pointer hover:bg-gray-200 sticky left-0 z-30"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
            onClick={() => useStore.getState().setSelection({ startRow: 0, startCol: 0, endRow: 9999, endCol: 9999 })}
          >
            ▾
          </div>

          {viewport.visibleColOffsets.baseOffset > 0 && (
            <div style={{ width: viewport.visibleColOffsets.baseOffset, height: COL_HEADER_HEIGHT, flexShrink: 0 }} />
          )}

          {Array.from({ length: viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1 }, (_, j) => {
            const col = viewport.visibleRange.startCol + j;
            return (
              <ColumnHeader
                key={col}
                col={col}
                width={resolvedGetColWidth(col)}
                isSelected={isColSelected(col)}
                sortDirection={activeSortConfig?.column === col ? activeSortConfig.direction : null}
                isFiltered={activeFilters.some((f) => f.column === col)}
                onSelect={selectionManager.handleColSelect}
                onResizeStart={resizeState.handleResizeStart}
                onResizeMove={resizeState.handleResizeMove}
                onResizeEnd={resizeState.handleResizeEnd}
                onAutoFit={resizeState.handleAutoFitColumn}
              />
            );
          })}
        </div>

        {/* ── Virtualized data rows ────────────────────────────────────────── */}
        <div style={{ height: viewport.rowOffset }} aria-hidden="true" />

        {Array.from({ length: viewport.visibleRange.endRow - viewport.visibleRange.startRow + 1 }, (_, i) => {
          const displayIndex = viewport.visibleRange.startRow + i;
          const row = viewport.filteredRows ? viewport.filteredRows[displayIndex] : displayIndex;
          if (row == null) return null;

          return (
            <div key={`${displayIndex}-${row}`} className="flex" role="row" aria-rowindex={row + 2} style={{ height: CELL_HEIGHT }}>
              {/* Sticky row-number gutter */}
              <div
                role="rowheader"
                aria-colindex={1}
                className={`shrink-0 border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors sticky left-0 z-10 ${
                  isRowSelected(row)
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={{ width: ROW_HEADER_WIDTH, height: CELL_HEIGHT }}
                onClick={() => selectionManager.handleRowSelect(row)}
              >
                {row + 1}
              </div>

              {viewport.visibleColOffsets.baseOffset > 0 && (
                <div style={{ width: viewport.visibleColOffsets.baseOffset, height: CELL_HEIGHT, flexShrink: 0 }} />
              )}

              {Array.from({ length: viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1 }, (_, j) => {
                const col = viewport.visibleRange.startCol + j;
                const cellId = refToCell(row, col);
                const selected = selectionManager.isSelected(row, col);
                const active = selectionManager.isActiveCell(row, col);
                const crosshair = !active && !selected && selectionManager.selection != null &&
                  (row === selectionManager.selection.startRow || col === selectionManager.selection.startCol);

                return (
                  <GridCell
                    key={col}
                    row={row}
                    col={col}
                    cellId={cellId}
                    cellData={sheet.cells[cellId]}
                    computed={getComputedValue(row, col)}
                    colWidth={resolvedGetColWidth(col)}
                    cellHeight={CELL_HEIGHT}
                    isEditing={editingController.editingCell === cellId}
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

        <SelectionOverlay
          getColWidth={resolvedGetColWidth}
          totalCols={viewport.TOTAL_COLS}
          cellHeight={CELL_HEIGHT}
          rowHeaderWidth={ROW_HEADER_WIDTH}
          colHeaderHeight={COL_HEADER_HEIGHT}
        />

        <FreezePaneIndicators frozenRows={sheet.frozenRows} frozenCols={sheet.frozenCols} getColWidth={resolvedGetColWidth} />
      </div>

      <FormulaAutocomplete
        visible={!!editingController.editingCell && editingController.editValue.startsWith('=')}
        editValue={editingController.editValue}
        onSelect={editingController.handleAutocompleteSelect}
        position={editingController.autocompletePos}
      />
      <FindReplaceDialog isOpen={showFindReplace} onClose={() => setShowFindReplace(false)} />

      {pendingPreview && (
        <PendingActionBar
          description={pendingPreview.action.description}
          changeCount={pendingPreview.changes.length}
          actionId={pendingPreview.action.id}
          onApply={applyAction}
          onReject={rejectAction}
        />
      )}

      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {selectionManager.selection && `Cell ${colToLetter(selectionManager.selection.startCol)}${selectionManager.selection.startRow + 1} selected`}
      </div>
    </div>
  );
}
