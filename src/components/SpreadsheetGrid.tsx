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
import { getRowHeight, clampRowHeight } from '@/lib/rowLayout';
import { frozenColStickyLeft, frozenRowStickyTop } from '@/lib/gridFreeze';
import { useTouch } from '@/hooks/useTouch';
import { getCellNotesService } from '@/lib/cellNotes';
import { buildMergeIndex, isMergeAnchor, type MergeRange } from '@/lib/merge';
import { pointToCell } from '@/lib/autofill';
import { GridCell, FillHandle } from './grid';
import { useGridViewport } from './grid/GridViewport';
import { useEditingController } from './grid/EditingController';
import { useSelectionManager } from './grid/SelectionManager';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CELL_WIDTH = 100;
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
    resizeStartRef.current = { col, startX: e.clientX, startWidth: columnWidths[col] ?? getColWidth(col) };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [getColWidth, columnWidths]);

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

// ─── Row Resize Hook ──────────────────────────────────────────────────────────

function useRowResize(getRowHeightFor: (row: number) => number, onCommit: (row: number, height: number) => void) {
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const resizeStartRef = useRef<{ row: number; startY: number; startHeight: number } | null>(null);

  const workbookId = useStore((s) => s.workbook.id);
  const activeSheetId = useStore((s) => s.activeSheetId);
  useEffect(() => { setRowHeights({}); }, [workbookId, activeSheetId]);

  useEffect(() => () => {
    resizeStartRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const handleResizeEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    resizeStartRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (!start) return;
    const finalHeight = clampRowHeight(start.startHeight + (e.clientY - start.startY));
    // Commit first so the store update and the local-overlay clear land in the
    // same paint. Clearing first would flash the old committed height for a frame.
    if (finalHeight !== start.startHeight) onCommit(start.row, finalHeight);
    setRowHeights((prev) => {
      const next = { ...prev };
      delete next[start.row];
      return next;
    });
  }, [onCommit]);

  const handleResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    if ((e.buttons & 1) === 0) { handleResizeEnd(e); return; }
    setRowHeights((prev) => ({
      ...prev,
      [start.row]: clampRowHeight(start.startHeight + (e.clientY - start.startY)),
    }));
  }, [handleResizeEnd]);

  const handleResizeStart = useCallback((row: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic/untrusted events; move/up still land on the handle.
    }
    resizeStartRef.current = { row, startY: e.clientY, startHeight: getRowHeightFor(row) };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [getRowHeightFor]);

  return { rowHeights, handleResizeStart, handleResizeMove, handleResizeEnd };
}

// ─── Touch Adapter Hook ───────────────────────────────────────────────────────

interface TouchAdapterConfig {
  gridRef: React.RefObject<HTMLDivElement | null>;
  selectionManager: ReturnType<typeof useSelectionManager>;
  getColWidth: (col: number) => number;
  visibleRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  visibleColOffsets: { offsets: number[]; baseOffset: number };
  rowOffsets: number[];
}

function useGridTouch({ gridRef, selectionManager, getColWidth, visibleRange, visibleColOffsets, rowOffsets }: TouchAdapterConfig) {
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
    rowOffsets,
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

function FreezePaneIndicators({ frozenRows, frozenCols, getColWidth, frozenRowHeight }: {
  frozenRows: number;
  frozenCols: number;
  getColWidth: (col: number) => number;
  /** Total height of the frozen row block in display-row pixels. */
  frozenRowHeight: number;
}) {
  const frozenColLeft = useMemo(() => {
    if (frozenCols <= 0) return 0;
    let w = ROW_HEADER_WIDTH;
    for (let c = 0; c < frozenCols; c++) w += getColWidth(c);
    return w;
  }, [frozenCols, getColWidth]);

  return (
    <>
      {frozenRows > 0 && (
        <div className="absolute pointer-events-none z-[8]" style={{ top: frozenRowHeight + COL_HEADER_HEIGHT, left: 0, right: 0, height: 2, backgroundColor: '#3b82f6', opacity: 0.6 }} />
      )}
      {frozenCols > 0 && (
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
  /** When set, pin this header under horizontal scroll (frozen columns). */
  stickyLeft?: number;
  onSelect: (col: number) => void;
  onResizeStart: (col: number, e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  onAutoFit: (col: number) => void;
}

function ColumnHeader({ col, width, isSelected, sortDirection, isFiltered, stickyLeft, onSelect, onResizeStart, onResizeMove, onResizeEnd, onAutoFit }: ColumnHeaderProps) {
  return (
    <div
      role="columnheader"
      aria-colindex={col + 2}
      className={`relative group shrink-0 border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-100 text-blue-700 border-blue-300'
          : 'bg-gradient-to-b from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
      style={{
        width,
        height: COL_HEADER_HEIGHT,
        ...(stickyLeft != null
          ? { position: 'sticky', left: stickyLeft, zIndex: 25 }
          : {}),
      }}
      onClick={() => onSelect(col)}
    >
      {colToLetter(col)}
      {sortDirection && <span className="ml-0.5 text-blue-500 text-[9px]">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
      {isFiltered && <span className="ml-0.5 text-amber-500 text-[9px]">⏷</span>}
      <div
        className="col-resize-handle absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 z-10 touch-none"
        onPointerDown={(e) => onResizeStart(col, e)}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={(e) => { e.stopPropagation(); onAutoFit(col); }}
      />
    </div>
  );
}

// ─── Row Header ───────────────────────────────────────────────────────────────

interface RowHeaderProps {
  row: number;
  height: number;
  isSelected: boolean;
  /** Raise above frozen body cells when this header is in a sticky frozen row. */
  stickyZIndex?: number;
  onSelect: (row: number) => void;
  onResizeStart: (row: number, e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizeEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  onAutoFit: (row: number) => void;
}

function RowHeader({ row, height, isSelected, stickyZIndex = 10, onSelect, onResizeStart, onResizeMove, onResizeEnd, onAutoFit }: RowHeaderProps) {
  return (
    <div
      role="rowheader"
      aria-colindex={1}
      className={`group shrink-0 border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium cursor-pointer transition-colors sticky left-0 ${
        isSelected
          ? 'bg-blue-100 text-blue-700 border-blue-300'
          : 'bg-gradient-to-r from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
      style={{ width: ROW_HEADER_WIDTH, height, zIndex: stickyZIndex, position: 'sticky' }}
      onClick={() => onSelect(row)}
    >
      {row + 1}
      <div
        className="row-resize-handle absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 z-10 touch-none"
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize row ${row + 1}`}
        title="Drag to resize · double-click to autofit wrapped text"
        onPointerDown={(e) => onResizeStart(row, e)}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onAutoFit(row);
        }}
        onClick={(e) => e.stopPropagation()}
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
    return sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [sheet.columnWidths]);

  const resizeState = useColumnResize(getColWidth, getActiveSheet, getComputedValue);

  // Reassign getColWidth to use local state (avoids stale closure)
  const resolvedGetColWidth = useCallback((col: number) => {
    return resizeState.columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [resizeState.columnWidths, sheet.columnWidths]);

  // Row resize: local overrides give live feedback during the drag, then a
  // single store commit writes the final height (undoable) on pointerup.
  const committedGetRowHeight = useCallback((row: number) => getRowHeight(sheet.rowHeights, row), [sheet.rowHeights]);

  const commitRowHeight = useCallback((row: number, h: number) => {
    useStore.getState().setRowHeight(row, h);
  }, []);

  const autoFitRow = useCallback((row: number) => {
    useStore.getState().autoFitRows([row]);
  }, []);

  const rowResize = useRowResize(committedGetRowHeight, commitRowHeight);

  const resolvedRowHeights = useMemo(() => {
    if (Object.keys(rowResize.rowHeights).length === 0) return sheet.rowHeights;
    return { ...sheet.rowHeights, ...rowResize.rowHeights };
  }, [sheet.rowHeights, rowResize.rowHeights]);

  const resolvedGetRowHeight = useCallback(
    (row: number) => getRowHeight(resolvedRowHeights, row),
    [resolvedRowHeights],
  );

  const viewportSheet = useMemo(() => {
    if (Object.keys(rowResize.rowHeights).length === 0) return sheet;
    return { ...sheet, rowHeights: resolvedRowHeights };
  }, [sheet, resolvedRowHeights, rowResize.rowHeights]);

  // Merged-cell index for the active sheet
  const mergeIndex = useMemo(() => buildMergeIndex(sheet.mergedCells), [sheet.mergedCells]);

  const mergeSpanWidth = useCallback((m: MergeRange) => {
    let w = 0;
    for (let c = m.startCol; c <= m.endCol; c++) w += resolvedGetColWidth(c);
    return w;
  }, [resolvedGetColWidth]);

  // Pixel boxes for multi-row merges, drawn behind the cells so the anchor's
  // text/format stay visible while the box unifies the covered region.
  const multiRowMergeBoxes = useMemo(() => {
    const boxes: Array<{ top: number; left: number; width: number; height: number; bg: string; borderColor: string }> = [];
    for (const range of mergeIndex.anchors.values()) {
      if (range.startRow === range.endRow) continue;
      let top = 0;
      for (let r = 0; r < range.startRow; r++) top += resolvedGetRowHeight(r);
      let height = 0;
      for (let r = range.startRow; r <= range.endRow; r++) height += resolvedGetRowHeight(r);
      let left = 0;
      for (let c = 0; c < range.startCol; c++) left += resolvedGetColWidth(c);
      let width = 0;
      for (let c = range.startCol; c <= range.endCol; c++) width += resolvedGetColWidth(c);
      const anchorCell = sheet.cells[refToCell(range.startRow, range.startCol)];
      const bg = anchorCell?.format?.bgColor || '#ffffff';
      const bottomBorder = anchorCell?.format?.borders?.bottom;
      const match = /solid|dashed|dotted\s+(.+)$/.exec(String(bottomBorder ?? ''));
      const borderColor = match?.[1]?.trim() || '#b0b0b0';
      boxes.push({ top, left, width, height, bg, borderColor });
    }
    return boxes;
  }, [mergeIndex, sheet.cells, resolvedGetRowHeight, resolvedGetColWidth]);

  // Viewport (virtualization)
  const viewport = useGridViewport({
    sheet: viewportSheet,
    getComputedValue,
    activeFilters,
    getColWidth: resolvedGetColWidth,
  });

  // Selection & editing
  const scrollCellIntoView = useCallback((row: number, col: number) => {
    const gridEl = viewport.gridRef.current;
    if (!gridEl) return;

    const frozenRows = viewport.frozenRows;
    const frozenCols = viewport.frozenCols;
    const displayRow = viewport.filteredRows ? viewport.filteredRows.indexOf(row) : row;
    if (displayRow < 0) return;

    // Vertical: use display-row offsets so filter + freeze insets match what is pinned.
    const cellTop = viewport.rowOffsets[displayRow] ?? 0;
    const cellBottom = viewport.rowOffsets[displayRow + 1] ?? cellTop;
    const freezeTop = viewport.rowOffsets[frozenRows] ?? 0;
    const { scrollTop, clientHeight } = gridEl;
    const topInset = displayRow < frozenRows ? 0 : freezeTop;

    if (cellBottom > scrollTop + clientHeight) gridEl.scrollTop = cellBottom - clientHeight;
    else if (cellTop < scrollTop + topInset) gridEl.scrollTop = Math.max(0, cellTop - topInset);

    let cellLeft = 0;
    for (let i = 0; i < col; i++) cellLeft += resolvedGetColWidth(i);
    const cellRight = cellLeft + resolvedGetColWidth(col);
    let freezeLeft = 0;
    for (let i = 0; i < frozenCols; i++) freezeLeft += resolvedGetColWidth(i);
    const { scrollLeft, clientWidth } = gridEl;
    const leftInset = col < frozenCols ? 0 : freezeLeft;

    if (cellRight > scrollLeft + clientWidth) gridEl.scrollLeft = cellRight - clientWidth;
    else if (cellLeft < scrollLeft + leftInset) gridEl.scrollLeft = Math.max(0, cellLeft - leftInset);
  }, [viewport.gridRef, viewport.frozenRows, viewport.frozenCols, viewport.filteredRows, viewport.rowOffsets, resolvedGetColWidth]);

  // Cumulative pixel offsets for point→cell mapping (fill drag).
  const rowOffsets = useMemo(() => {
    const offs = new Array<number>(viewport.TOTAL_ROWS + 1);
    let acc = 0;
    for (let r = 0; r < viewport.TOTAL_ROWS; r++) {
      offs[r] = acc;
      acc += resolvedGetRowHeight(r);
    }
    offs[viewport.TOTAL_ROWS] = acc;
    return offs;
  }, [viewport.TOTAL_ROWS, resolvedGetRowHeight]);

  const colOffsets = useMemo(() => {
    const offs = new Array<number>(viewport.TOTAL_COLS + 1);
    let acc = 0;
    for (let c = 0; c < viewport.TOTAL_COLS; c++) {
      offs[c] = acc;
      acc += resolvedGetColWidth(c);
    }
    offs[viewport.TOTAL_COLS] = acc;
    return offs;
  }, [viewport.TOTAL_COLS, resolvedGetColWidth]);

  const pointToCellInViewport = useCallback((clientX: number, clientY: number) => {
    const gridEl = viewport.gridRef.current;
    if (!gridEl) return { row: 0, col: 0 };
    const rect = gridEl.getBoundingClientRect();
    return pointToCell(clientX, clientY, {
      gridLeft: rect.left,
      gridTop: rect.top,
      scrollLeft: gridEl.scrollLeft,
      scrollTop: gridEl.scrollTop,
      rowHeaderWidth: ROW_HEADER_WIDTH,
      colHeaderHeight: COL_HEADER_HEIGHT,
      rowOffsets,
      colOffsets,
      totalRows: viewport.TOTAL_ROWS,
      totalCols: viewport.TOTAL_COLS,
    });
  }, [viewport.gridRef, viewport.TOTAL_ROWS, viewport.TOTAL_COLS, rowOffsets, colOffsets]);

  const onEditStartRef = useRef<() => void>(() => {});

  const selectionManager = useSelectionManager({
    TOTAL_ROWS: viewport.TOTAL_ROWS,
    TOTAL_COLS: viewport.TOTAL_COLS,
    pushHistory,
    setShowFindReplace,
    findLastDataRow,
    scrollCellIntoView,
    onEditStart: () => onEditStartRef.current(),
    pointToCellInViewport,
  });

  const editingController = useEditingController({
    setEditingCell: selectionManager.setEditingCell,
    setEditValue: selectionManager.setEditValue,
    setCellValue,
    pushHistory,
    validateCellValue: useStore.getState().validateCellValue,
    setSelection: selectionManager.setSelection,
    focusGrid: () => viewport.gridRef.current?.focus({ preventScroll: true }),
  });

  onEditStartRef.current = () => {
    const focusEditorInput = () => {
      const input = editingController.inputRef.current;
      if (!input) return false;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      return true;
    };
    // The editor input commits asynchronously after the store update; focus it on
    // the first frame where it exists so iOS still treats it as gesture-initiated.
    if (focusEditorInput()) return;
    let attempts = 0;
    const retry = () => {
      if (!focusEditorInput() && ++attempts < 3) requestAnimationFrame(retry);
    };
    requestAnimationFrame(retry);
  };

  // Fill-handle position (bottom-right corner of the selection) + live preview rect.
  const fillHandlePos = useMemo(() => {
    const sel = selectionManager.selection;
    if (!sel || editingController.editingCell) return null;
    const maxRow = Math.max(sel.startRow, sel.endRow);
    const maxCol = Math.max(sel.startCol, sel.endCol);
    let top = COL_HEADER_HEIGHT;
    for (let r = 0; r <= maxRow; r++) top += resolvedGetRowHeight(r);
    let left = ROW_HEADER_WIDTH;
    for (let c = 0; c <= maxCol; c++) left += resolvedGetColWidth(c);
    return { top: top - 5, left: left - 5 };
  }, [selectionManager.selection, editingController.editingCell, resolvedGetRowHeight, resolvedGetColWidth]);

  const fillPreviewRect = useMemo(() => {
    const sel = selectionManager.selection;
    const target = selectionManager.fillTarget;
    if (!sel || !target) return null;
    const sr0 = Math.min(sel.startRow, sel.endRow);
    const sr1 = Math.max(sel.startRow, sel.endRow);
    const sc0 = Math.min(sel.startCol, sel.endCol);
    const sc1 = Math.max(sel.startCol, sel.endCol);
    const endRow = Math.max(sr1, target.row);
    const endCol = Math.max(sc1, target.col);
    if (endRow <= sr1 && endCol <= sc1) return null;
    let top = COL_HEADER_HEIGHT;
    for (let r = 0; r < sr0; r++) top += resolvedGetRowHeight(r);
    let left = ROW_HEADER_WIDTH;
    for (let c = 0; c < sc0; c++) left += resolvedGetColWidth(c);
    let height = 0;
    for (let r = sr0; r <= endRow; r++) height += resolvedGetRowHeight(r);
    let width = 0;
    for (let c = sc0; c <= endCol; c++) width += resolvedGetColWidth(c);
    return { top, left, width, height };
  }, [selectionManager.selection, selectionManager.fillTarget, resolvedGetRowHeight, resolvedGetColWidth]);

  // Touch support
  const touch = useGridTouch({
    gridRef: viewport.gridRef,
    selectionManager,
    getColWidth: resolvedGetColWidth,
    visibleRange: viewport.visibleRange,
    visibleColOffsets: viewport.visibleColOffsets,
    rowOffsets: viewport.rowOffsets,
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

  const { frozenRows, frozenCols } = viewport;

  const renderDataCell = (row: number, col: number, rowHeight: number, stickyLeft: number | null, stickyZ: number) => {
    const cellId = refToCell(row, col);
    const merge = mergeIndex.byCell.get(cellId);
    const isMergeCell = merge != null;
    const isMergeHead = isMergeCell && isMergeAnchor(mergeIndex, row, col);
    const singleRowMerge = isMergeCell && merge.startRow === merge.endRow;

    if (isMergeCell && !isMergeHead && singleRowMerge && row === merge.startRow) return null;

    const colWidth = isMergeHead && singleRowMerge
      ? mergeSpanWidth(merge)
      : resolvedGetColWidth(col);

    if (isMergeCell && !isMergeHead) {
      const spacer = (
        <div
          key={col}
          className="shrink-0"
          style={{ width: colWidth, height: rowHeight }}
          aria-hidden="true"
        />
      );
      if (stickyLeft == null) return spacer;
      return (
        <div
          key={col}
          className="shrink-0"
          style={{
            position: 'sticky',
            left: stickyLeft,
            zIndex: stickyZ,
            width: colWidth,
            height: rowHeight,
            backgroundColor: '#fff',
          }}
          aria-hidden="true"
        />
      );
    }

    const selected = selectionManager.isSelected(row, col);
    const active = selectionManager.isActiveCell(row, col);
    const crosshair = !active && !selected && selectionManager.selection != null &&
      (row === selectionManager.selection.startRow || col === selectionManager.selection.startCol);

    const cell = (
      <GridCell
        key={stickyLeft == null ? col : undefined}
        row={row}
        col={col}
        cellId={cellId}
        cellData={sheet.cells[cellId]}
        computed={getComputedValue(row, col)}
        colWidth={colWidth}
        cellHeight={rowHeight}
        isEditing={editingController.editingCell === cellId}
        isActive={active}
        isSelected={selected}
        isCrosshair={crosshair}
        mergeBoxed={isMergeCell && isMergeHead && merge.endRow > merge.startRow}
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

    if (stickyLeft == null) return cell;
    return (
      <div
        key={col}
        className="shrink-0"
        style={{
          position: 'sticky',
          left: stickyLeft,
          zIndex: stickyZ,
          backgroundColor: '#fff',
        }}
      >
        {cell}
      </div>
    );
  };

  const renderRowColumns = (row: number, rowHeight: number, isFrozenRow: boolean) => {
    const frozenZ = isFrozenRow ? 14 : 11;
    return (
      <>
        {Array.from({ length: frozenCols }, (_, col) =>
          renderDataCell(
            row,
            col,
            rowHeight,
            frozenColStickyLeft(ROW_HEADER_WIDTH, resolvedGetColWidth, col),
            frozenZ,
          ),
        )}

        {viewport.visibleColOffsets.baseOffset > 0 && (
          <div style={{ width: viewport.visibleColOffsets.baseOffset, height: rowHeight, flexShrink: 0 }} />
        )}

        {Array.from({ length: Math.max(0, viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1) }, (_, j) => {
          const col = viewport.visibleRange.startCol + j;
          return renderDataCell(row, col, rowHeight, null, 0);
        })}
      </>
    );
  };

  const renderGridRow = (displayIndex: number, stickyTop: number | null) => {
    const row = viewport.filteredRows ? viewport.filteredRows[displayIndex] : displayIndex;
    if (row == null) return null;

    const rowHeight = resolvedGetRowHeight(row);
    const isFrozenRow = stickyTop != null;

    return (
      <div
        key={`${displayIndex}-${row}`}
        className="flex"
        role="row"
        aria-rowindex={row + 2}
        style={{
          height: rowHeight,
          ...(isFrozenRow
            ? {
                position: 'sticky',
                top: stickyTop,
                zIndex: 12,
                backgroundColor: '#fff',
              }
            : {}),
        }}
      >
        <RowHeader
          row={row}
          height={rowHeight}
          isSelected={isRowSelected(row)}
          stickyZIndex={isFrozenRow ? 15 : 10}
          onSelect={selectionManager.handleRowSelect}
          onResizeStart={rowResize.handleResizeStart}
          onResizeMove={rowResize.handleResizeMove}
          onResizeEnd={rowResize.handleResizeEnd}
          onAutoFit={autoFitRow}
        />
        {renderRowColumns(row, rowHeight, isFrozenRow)}
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={viewport.gridRef}
      data-spreadsheet-grid
      role="grid"
      aria-label="Spreadsheet grid"
      aria-rowcount={viewport.TOTAL_ROWS}
      aria-colcount={viewport.TOTAL_COLS}
      className="flex-1 overflow-auto relative touch-pan-x touch-pan-y focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400/60"
      tabIndex={0}
      onKeyDown={handleGridKeyDown}
      onMouseUp={selectionManager.handleMouseUp}
      onTouchStart={touch.onTouchStart}
      onTouchMove={touch.onTouchMove}
      onTouchEnd={touch.onTouchEnd}
      onTouchCancel={touch.onTouchCancel}
      style={{ outline: 'none', userSelect: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ width: ROW_HEADER_WIDTH + viewport.totalWidth, height: COL_HEADER_HEIGHT + viewport.totalHeight, position: 'relative', isolation: 'isolate' }}>

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
            onClick={() => useStore.getState().setSelection({ startRow: 0, startCol: 0, endRow: viewport.TOTAL_ROWS - 1, endCol: viewport.TOTAL_COLS - 1 })}
          >
            ▾
          </div>

          {Array.from({ length: frozenCols }, (_, col) => (
            <ColumnHeader
              key={`fz-${col}`}
              col={col}
              width={resolvedGetColWidth(col)}
              isSelected={isColSelected(col)}
              sortDirection={activeSortConfig?.column === col ? activeSortConfig.direction : null}
              isFiltered={activeFilters.some((f) => f.column === col)}
              stickyLeft={frozenColStickyLeft(ROW_HEADER_WIDTH, resolvedGetColWidth, col)}
              onSelect={selectionManager.handleColSelect}
              onResizeStart={resizeState.handleResizeStart}
              onResizeMove={resizeState.handleResizeMove}
              onResizeEnd={resizeState.handleResizeEnd}
              onAutoFit={resizeState.handleAutoFitColumn}
            />
          ))}

          {viewport.visibleColOffsets.baseOffset > 0 && (
            <div style={{ width: viewport.visibleColOffsets.baseOffset, height: COL_HEADER_HEIGHT, flexShrink: 0 }} />
          )}

          {Array.from({ length: Math.max(0, viewport.visibleRange.endCol - viewport.visibleRange.startCol + 1) }, (_, j) => {
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

        {/* ── Frozen rows (always mounted, sticky under col header) ─────────── */}
        {Array.from({ length: frozenRows }, (_, displayIndex) =>
          renderGridRow(displayIndex, frozenRowStickyTop(COL_HEADER_HEIGHT, viewport.rowOffsets, displayIndex)),
        )}

        {/* ── Virtualized body rows ─────────────────────────────────────────── */}
        <div style={{ height: viewport.rowOffset }} aria-hidden="true" />

        {Array.from({ length: Math.max(0, viewport.visibleRange.endRow - viewport.visibleRange.startRow + 1) }, (_, i) => {
          const displayIndex = viewport.visibleRange.startRow + i;
          return renderGridRow(displayIndex, null);
        })}

        {/* Multi-row merge boxes — drawn behind cell content so anchor text stays visible */}
        {multiRowMergeBoxes.map((box, idx) => (
          <div
            key={idx}
            className="pointer-events-none"
            style={{
              position: 'absolute',
              zIndex: -1,
              top: box.top + COL_HEADER_HEIGHT,
              left: box.left + ROW_HEADER_WIDTH,
              width: box.width,
              height: box.height,
              backgroundColor: box.bg,
              border: `1px solid ${box.borderColor}`,
              boxSizing: 'border-box',
            }}
          />
        ))}

        <SelectionOverlay
          getColWidth={resolvedGetColWidth}
          totalCols={viewport.TOTAL_COLS}
          rowHeights={resolvedRowHeights}
          rowHeaderWidth={ROW_HEADER_WIDTH}
          colHeaderHeight={COL_HEADER_HEIGHT}
        />

        {fillHandlePos && (
          <FillHandle top={fillHandlePos.top} left={fillHandlePos.left} onPointerDown={selectionManager.handleFillPointerDown} />
        )}

        {fillPreviewRect && (
          <div
            className="absolute pointer-events-none z-[6]"
            style={{
              top: fillPreviewRect.top,
              left: fillPreviewRect.left,
              width: fillPreviewRect.width,
              height: fillPreviewRect.height,
              border: '2px dashed rgba(59, 130, 246, 0.8)',
              boxSizing: 'border-box',
            }}
          />
        )}

        <FreezePaneIndicators
          frozenRows={frozenRows}
          frozenCols={frozenCols}
          getColWidth={resolvedGetColWidth}
          frozenRowHeight={viewport.rowOffsets[frozenRows] ?? 0}
        />
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
