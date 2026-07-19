import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Check, XCircle } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell, cellToRef } from '@/engine/spreadsheet';
import { FormulaAutocomplete } from './FormulaAutocomplete';
import { FindReplaceDialog } from './FindReplaceDialog';
import { SelectionOverlay } from './SelectionOverlay';
import type { CellFormat } from '@/types';
import { formatCellValue, getBorderCSS, isNegativeRedFormat } from '@/lib/formatUtils';
import { buildFilteredRowIndex } from '@/lib/rowFilter';
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort';
import { resolveCellFormat, getDataBarRule, dataBarWidthPercent, columnDataBarPeerValues } from '@/lib/conditionalFormat';
import { findActivePendingPreview } from '@/lib/pendingActionPreview';
import { useTouch } from '@/hooks/useTouch';

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
    editingCell,
    editValue,
    setSelection,
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

  const pendingPreview = useMemo(
    () => findActivePendingPreview(messages),
    [messages],
  );

  // Cache data-bar peer values per column for proportional fills
  const dataBarPeersByCol = useMemo(() => {
    const map = new Map<number, number[]>()
    const cols = new Set<number>()
    for (const cellId of Object.keys(sheet.cells)) {
      const cell = sheet.cells[cellId]
      if (!cell?.format?.conditionalRules?.some((r) => r.type === 'dataBar')) continue
      cols.add(cellToRef(cellId).col)
    }
    for (const col of cols) {
      map.set(col, columnDataBarPeerValues(sheet, col, getComputedValue))
    }
    return map
  }, [sheet, getComputedValue]);

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

  // Dynamic grid bounds: show only enough rows/cols to contain data + buffer
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

  const displayRowCount = filteredRows ? filteredRows.length : TOTAL_ROWS;
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [showFindReplace, setShowFindReplace] = useState(false);

  const getColWidth = useCallback((col: number) => {
    return columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [columnWidths, sheet.columnWidths]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      // Move cursor to end
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editingCell]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    pushHistory('Edit cell ' + editingCell);
    const val = editValue;
    if (val.startsWith('=')) {
      setCellValue(editingCell, null, val);
    } else {
      const num = Number(val);
      if (val !== '' && !isNaN(num)) {
        setCellValue(editingCell, num);
      } else {
        setCellValue(editingCell, val || null);
      }
    }
    // Validate cell value
    const { validateCellValue } = useStore.getState();
    const cellVal = val.startsWith('=') ? null : (val !== '' && !isNaN(Number(val)) ? Number(val) : (val || null));
    const result = validateCellValue(editingCell, cellVal);
    useStore.setState((state) => {
      const cell = state.getActiveSheet().cells[editingCell];
      if (cell) {
        if (!result.valid) {
          cell.validationError = result.message;
        } else {
          delete cell.validationError;
        }
      }
    });

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, pushHistory, setCellValue, setEditingCell, setEditValue]);

  const handleCellClick = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.shiftKey && selection) {
      setSelection({
        startRow: selection.startRow,
        startCol: selection.startCol,
        endRow: row,
        endCol: col,
      });
    } else {
      setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    }
    if (editingCell) commitEdit();
    setEditingCell(null);
  }, [selection, editingCell, setSelection, setEditingCell, commitEdit]);

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    const cellId = refToCell(row, col);
    const cellData = sheet.cells[cellId];
    setEditingCell(cellId);
    setEditValue(cellData?.formula || String(cellData?.value ?? ''));
    setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    requestAnimationFrame(() => {
      if (editContainerRef.current) {
        const rect = editContainerRef.current.getBoundingClientRect();
        setAutocompletePos({ top: rect.bottom + 2, left: rect.left });
      }
    });
  }, [sheet.cells, setEditingCell, setEditValue, setSelection]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (editingCell) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
        const ref = cellToRef(editingCell);
        setSelection({ startRow: ref.row + 1, startCol: ref.col, endRow: ref.row + 1, endCol: ref.col });
      } else if (e.key === 'Escape') {
        setEditingCell(null);
        setEditValue('');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit();
        const ref = cellToRef(editingCell);
        const newCol = e.shiftKey ? Math.max(0, ref.col - 1) : ref.col + 1;
        setSelection({ startRow: ref.row, startCol: newCol, endRow: ref.row, endCol: newCol });
      }
      return;
    }

    if (!selection) return;
    const { startRow: r, startCol: c } = selection;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      pushHistory('Delete cells');
      const minR = Math.min(selection.startRow, selection.endRow);
      const maxR = Math.max(selection.startRow, selection.endRow);
      const minC = Math.min(selection.startCol, selection.endCol);
      const maxC = Math.max(selection.startCol, selection.endCol);
      for (let row = minR; row <= maxR; row++) {
        for (let col = minC; col <= maxC; col++) {
          setCellValue(refToCell(row, col), null);
        }
      }
      return;
    }

    const navigate = (nr: number, nc: number, shift: boolean) => {
      if (shift) {
        setSelection({ ...selection, endRow: nr, endCol: nc });
      } else {
        setSelection({ startRow: nr, startCol: nc, endRow: nr, endCol: nc });
      }
    };

    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); navigate(e.shiftKey ? selection.endRow - 1 : Math.max(0, r - 1), e.shiftKey ? selection.endCol : c, e.shiftKey); break;
      case 'ArrowDown': e.preventDefault(); navigate(e.shiftKey ? selection.endRow + 1 : r + 1, e.shiftKey ? selection.endCol : c, e.shiftKey); break;
      case 'ArrowLeft': e.preventDefault(); navigate(e.shiftKey ? selection.endRow : r, e.shiftKey ? Math.max(0, selection.endCol - 1) : Math.max(0, c - 1), e.shiftKey); break;
      case 'ArrowRight': e.preventDefault(); navigate(e.shiftKey ? selection.endRow : r, e.shiftKey ? selection.endCol + 1 : c + 1, e.shiftKey); break;
      case 'Enter':
      case 'F2': {
        e.preventDefault();
        const cellId = refToCell(r, c);
        setEditingCell(cellId);
        const cellData = sheet.cells[cellId];
        setEditValue(cellData?.formula || String(cellData?.value ?? ''));
        requestAnimationFrame(() => {
          if (editContainerRef.current) {
            const rect = editContainerRef.current.getBoundingClientRect();
            setAutocompletePos({ top: rect.bottom + 2, left: rect.left });
          }
        });
        break;
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const cellId = refToCell(r, c);
          setEditingCell(cellId);
          setEditValue(e.key);
          requestAnimationFrame(() => {
            if (editContainerRef.current) {
              const rect = editContainerRef.current.getBoundingClientRect();
              setAutocompletePos({ top: rect.bottom + 2, left: rect.left });
            }
          });
        }
        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'z': e.preventDefault(); useStore.getState().undo(); break;
            case 'y': e.preventDefault(); useStore.getState().redo(); break;
            case 'c': e.preventDefault(); useStore.getState().copy(); break;
            case 'x': e.preventDefault(); useStore.getState().cut(); break;
            case 'v': e.preventDefault(); useStore.getState().paste(); break;
            case 'a': e.preventDefault(); setSelection({ startRow: 0, startCol: 0, endRow: TOTAL_ROWS - 1, endCol: TOTAL_COLS - 1 }); break;
            case 'f': case 'h': e.preventDefault(); setShowFindReplace(true); break;
            case 'End': {
              // Ctrl+End: jump to last cell with data (like Excel)
              e.preventDefault();
              const lastRow = findLastDataRow(sheet);
              const lastCol = Object.keys(sheet.cells).reduce((max, cid) => {
                const ref = cellToRef(cid);
                return ref ? Math.max(max, ref.col) : max;
              }, 0);
              setSelection({ startRow: lastRow, startCol: lastCol, endRow: lastRow, endCol: lastCol });
              // Scroll to the last data cell
              if (gridRef.current) {
                gridRef.current.scrollTop = Math.max(0, lastRow * CELL_HEIGHT - gridRef.current.clientHeight / 2);
              }
              break;
            }
            case 'Home': {
              // Ctrl+Home: jump to A1
              e.preventDefault();
              setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
              if (gridRef.current) {
                gridRef.current.scrollTop = 0;
                gridRef.current.scrollLeft = 0;
              }
              break;
            }
            case 'b': {
              e.preventDefault();
              const cellId = refToCell(r, c);
              const currentBold = sheet.cells[cellId]?.format?.bold ?? false;
              useStore.getState().setRangeFormat({ bold: !currentBold });
              break;
            }
            case 'i': {
              e.preventDefault();
              const cellId2 = refToCell(r, c);
              const currentItalic = sheet.cells[cellId2]?.format?.italic ?? false;
              useStore.getState().setRangeFormat({ italic: !currentItalic });
              break;
            }
          }
        }
    }
  }, [editingCell, selection, sheet.cells, commitEdit, pushHistory, setCellValue, setSelection, setEditingCell, setEditValue]);

  const handleAutocompleteSelect = useCallback((functionName: string) => {
    if (!functionName) return;
    setEditValue('=' + functionName + '(');
  }, [setEditValue]);

  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    handleCellClick(row, col, e);
  }, [handleCellClick]);

  const handleMouseMove = useCallback((row: number, col: number) => {
    if (!isDragging || !selection) return;
    setSelection({
      startRow: selection.startRow,
      startCol: selection.startCol,
      endRow: row,
      endCol: col,
    });
  }, [isDragging, selection, setSelection]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleContextMenu = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, cell: refToCell(row, col) });
  }, [setContextMenu]);

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

  // Touch support for mobile
  const getScrollOffset = useCallback(() => {
    if (!gridRef.current) return { scrollTop: 0, scrollLeft: 0 };
    return { scrollTop: gridRef.current.scrollTop, scrollLeft: gridRef.current.scrollLeft };
  }, []);

  const handleTouchTap = useCallback((row: number, col: number) => {
    setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    if (editingCell) commitEdit();
    setEditingCell(null);
  }, [setSelection, editingCell, commitEdit, setEditingCell]);

  const handleTouchDoubleTap = useCallback((row: number, col: number) => {
    handleCellDoubleClick(row, col);
  }, [handleCellDoubleClick]);

  const handleTouchLongPress = useCallback((row: number, col: number, x: number, y: number) => {
    // Select cell and show context menu
    setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    setContextMenu({ x, y, cell: refToCell(row, col) });
  }, [setSelection, setContextMenu]);

  const handleTouchDragSelect = useCallback((row: number, col: number) => {
    if (!selection) return;
    setSelection({
      startRow: selection.startRow,
      startCol: selection.startCol,
      endRow: row,
      endCol: col,
    });
  }, [selection, setSelection]);

  const handleTouchDragEnd = useCallback(() => {
    // Nothing needed for now; selection is already set
  }, []);

  const isSelected = useCallback((row: number, col: number) => {
    if (!selection) return false;
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    return row >= minR && row <= maxR && col >= minC && col <= maxC;
  }, [selection]);

  const isActiveCell = useCallback((row: number, col: number) => {
    return selection?.startRow === row && selection?.startCol === col;
  }, [selection]);

  const getCellStyle = useCallback((format: CellFormat | undefined, cellValue?: string | number | boolean | null): React.CSSProperties => {
    if (!format) return {};
    const style: React.CSSProperties = {
      fontWeight: format.bold ? 700 : undefined,
      fontStyle: format.italic ? 'italic' : undefined,
      textDecoration: format.underline ? 'underline' : undefined,
      fontSize: format.fontSize ? `${format.fontSize}px` : undefined,
      color: format.fontColor || undefined,
      backgroundColor: format.bgColor || undefined,
      textAlign: format.textAlign || undefined,
      ...getBorderCSS(format.borders),
    };
    // Apply red text for negative values with number-neg-red format
    if (isNegativeRedFormat(format.numberFormat, cellValue ?? null) && !format.fontColor) {
      style.color = '#DC2626';
    }
    return style;
  }, []);

  // Select all cells in a row
  const handleRowSelect = useCallback((row: number) => {
    setSelection({ startRow: row, startCol: 0, endRow: row, endCol: TOTAL_COLS - 1 });
  }, [setSelection]);

  // Select all cells in a column
  const handleColSelect = useCallback((col: number) => {
    setSelection({ startRow: 0, startCol: col, endRow: TOTAL_ROWS - 1, endCol: col });
  }, [setSelection]);

  // Virtual scrolling state
  const [scrollState, setScrollState] = useState({ scrollTop: 0, scrollLeft: 0, viewportHeight: 600, viewportWidth: 800 });

  const handleScroll = useCallback(() => {
    if (!gridRef.current) return;
    const { scrollTop, scrollLeft, clientHeight, clientWidth } = gridRef.current;
    setScrollState({ scrollTop, scrollLeft, viewportHeight: clientHeight, viewportWidth: clientWidth });
  }, []);

  // Calculate visible range (display indices when filtered)
  const visibleRange = useMemo(() => {
    const { scrollTop, scrollLeft, viewportHeight, viewportWidth } = scrollState;
    const startRow = Math.max(0, Math.floor(scrollTop / CELL_HEIGHT) - BUFFER_ROWS);
    const endRow = Math.min(displayRowCount - 1, Math.ceil((scrollTop + viewportHeight) / CELL_HEIGHT) + BUFFER_ROWS);
    
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
  }, [scrollState, getColWidth, displayRowCount]);

  // Calculate total dimensions
  const totalWidth = useMemo(() => {
    let width = 0;
    for (let i = 0; i < TOTAL_COLS; i++) {
      width += getColWidth(i);
    }
    return width;
  }, [getColWidth]);

  const totalHeight = displayRowCount * CELL_HEIGHT;

  // Offset for visible rows
  const rowOffset = visibleRange.startRow * CELL_HEIGHT;

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

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editingCell]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll first pending preview cell into view when a new preview appears
  useEffect(() => {
    if (!pendingPreview?.changes.length || !gridRef.current) return;
    const first = pendingPreview.changes[0]?.cell;
    if (!first) return;
    const ref = cellToRef(first);
    if (!ref) return;
    const top = ref.row * CELL_HEIGHT;
    let left = 0;
    for (let c = 0; c < ref.col; c++) left += getColWidth(c);
    gridRef.current.scrollTo({
      top: Math.max(0, top - CELL_HEIGHT * 2),
      left: Math.max(0, left - DEFAULT_CELL_WIDTH),
      behavior: 'smooth',
    });
  }, [pendingPreview?.action.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Touch hook for mobile interactions
  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useTouch({
    onTap: handleTouchTap,
    onDoubleTap: handleTouchDoubleTap,
    onLongPress: handleTouchLongPress,
    onDragSelect: handleTouchDragSelect,
    onDragEnd: handleTouchDragEnd,
    cellHeight: CELL_HEIGHT,
    rowHeaderWidth: ROW_HEADER_WIDTH,
    colHeaderHeight: COL_HEADER_HEIGHT,
    getColWidth,
    getScrollOffset,
    visibleRange,
    colOffsets: visibleColOffsets,
  });

  const onGridTouchStart = useCallback((e: React.TouchEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleTouchStart(e, rect);
  }, [handleTouchStart]);

  const onGridTouchMove = useCallback((e: React.TouchEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleTouchMove(e, rect);
  }, [handleTouchMove]);

  const onGridTouchEnd = useCallback((e: React.TouchEvent) => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    handleTouchEnd(e, rect);
  }, [handleTouchEnd]);

  return (
    <div
      ref={gridRef}
      data-spreadsheet-grid
      className="flex-1 overflow-auto relative touch-pan-x touch-pan-y"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={handleMouseUp}
      onTouchStart={onGridTouchStart}
      onTouchMove={onGridTouchMove}
      onTouchEnd={onGridTouchEnd}
      style={{ outline: 'none', userSelect: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      <div style={{ minWidth: ROW_HEADER_WIDTH + totalWidth + 20, height: totalHeight + COL_HEADER_HEIGHT }}>
        {/* Selection range overlay */}
        <SelectionOverlay
          getColWidth={getColWidth}
          totalCols={TOTAL_COLS}
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
        <div className="flex sticky top-0 z-20" style={{ height: COL_HEADER_HEIGHT }}>
          <div
            className="bg-gradient-to-b from-gray-100 to-gray-150 border-b border-r border-gray-300 flex items-center justify-center text-[10px] text-gray-400 font-medium shrink-0 sticky left-0 z-30"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
            onClick={() => setSelection({ startRow: 0, startCol: 0, endRow: TOTAL_ROWS - 1, endCol: TOTAL_COLS - 1 })}
          >
            ▾
          </div>
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
        </div>

        {/* Rows - virtualized */}
        <div className="relative" style={{ top: rowOffset }}>
          {Array.from({ length: Math.max(0, visibleRange.endRow - visibleRange.startRow + 1) }, (_, i) => {
            const displayIndex = visibleRange.startRow + i;
            const row = filteredRows ? filteredRows[displayIndex] : displayIndex;
            if (row == null) return null;
            const isRowSelected = selection &&
              row >= Math.min(selection.startRow, selection.endRow) &&
              row <= Math.max(selection.startRow, selection.endRow);
            return (
              <div key={`${displayIndex}-${row}`} className="flex absolute" style={{ height: CELL_HEIGHT, top: displayIndex * CELL_HEIGHT }}>
                <div
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
                <div className="relative" style={{ width: totalWidth, height: CELL_HEIGHT }}>
                  {Array.from({ length: visibleRange.endCol - visibleRange.startCol + 1 }, (_, j) => {
                    const col = visibleRange.startCol + j;
                    const cellId = refToCell(row, col);
                    const cellData = sheet.cells[cellId];
                    const selected = isSelected(row, col);
                    const active = isActiveCell(row, col);
                    const isEditing = editingCell === cellId;
                    const computed = getComputedValue(row, col);
                    const rawValue = (computed || cellData?.value) ?? null;
                    const hasFormula = !!cellData?.formula;
                    const colWidth = getColWidth(col);
                    const pendingChange = pendingPreview?.changeByCell.get(cellId) ?? null;
                    const dataBarRule = getDataBarRule(cellData?.format, computed);
                    const dataBarPct = dataBarRule
                      ? dataBarWidthPercent(computed, dataBarPeersByCol.get(col) ?? [])
                      : null;

                    return (
                      <div
                        ref={isEditing ? editContainerRef : undefined}
                        key={col}
                        className={`border-b border-r shrink-0 relative transition-shadow group/cell ${
                          pendingChange
                            ? 'ring-2 ring-emerald-400 ring-inset z-10 bg-emerald-50/80'
                            : active
                              ? 'ring-2 ring-blue-500 ring-inset z-10 bg-white'
                              : selected
                                ? 'bg-blue-50/60 border-blue-200'
                                : 'border-gray-200 hover:bg-blue-50/20'
                        }`}
                        style={{
                          width: colWidth,
                          height: CELL_HEIGHT,
                          position: 'absolute',
                          left: visibleColOffsets.offsets[j],
                          ...getCellStyle(resolveCellFormat(cellData?.format, computed), rawValue),
                          ...(pendingChange ? { backgroundColor: undefined } : {}),
                        }}
                        onMouseDown={(e) => handleMouseDown(row, col, e)}
                        onMouseMove={() => handleMouseMove(row, col)}
                        onDoubleClick={() => handleCellDoubleClick(row, col)}
                        onContextMenu={(e) => handleContextMenu(e, row, col)}
                      >
                        {dataBarPct != null && dataBarRule && !pendingChange && (
                          <div
                            className="absolute inset-y-1 left-0 rounded-sm pointer-events-none opacity-50"
                            style={{
                              width: `${dataBarPct}%`,
                              backgroundColor: dataBarRule.dataBarColor || '#93C5FD',
                            }}
                          />
                        )}
                        {isEditing && cellData?.validation?.type === 'list' ? (
                          <select
                            className="absolute inset-0 w-full h-full px-1.5 text-[13px] border-0 outline-none bg-white z-20 font-sans"
                            value={editValue}
                            onChange={(e) => { setEditValue(e.target.value); }}
                            onBlur={commitEdit}
                            autoFocus
                          >
                            <option value="">(empty)</option>
                            {cellData.validation.values?.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        ) : isEditing ? (
                          <input
                            ref={inputRef}
                            className="absolute inset-0 w-full h-full px-1.5 text-[13px] border-0 outline-none bg-white z-20 font-sans"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                          />
                        ) : (
                          <div className="flex items-center h-full">
                            <div
                              className={`px-1.5 truncate text-[13px] w-full ${
                                typeof cellData?.value === 'number' || (computed && !isNaN(Number(computed)) && computed !== '')
                                  ? 'text-right'
                                  : ''
                              }`}
                              title={hasFormula ? `${cellData?.formula} = ${formatCellValue(rawValue, cellData?.format?.numberFormat)}` : formatCellValue(rawValue, cellData?.format?.numberFormat)}
                            >
                              {pendingChange
                                ? formatCellValue(pendingChange.newValue ?? pendingChange.newFormula ?? '', cellData?.format?.numberFormat)
                                : formatCellValue(rawValue, cellData?.format?.numberFormat)}
                            </div>
                          </div>
                        )}
                        {pendingChange && !isEditing && (
                          <>
                            <span className="absolute top-0.5 right-0.5 text-[8px] leading-none bg-emerald-500 text-white font-bold px-0.5 rounded z-20">
                              AI
                            </span>
                            <div className="absolute bottom-full right-0 mb-1 hidden group-hover/cell:block bg-gray-900 text-white p-2 rounded-lg shadow-xl border border-emerald-400 w-48 text-[10px] z-50 pointer-events-none">
                              <div className="font-semibold text-emerald-300 mb-1">Proposed change</div>
                              <div className="text-gray-400 line-through truncate">
                                Old: {String(pendingChange.oldValue ?? pendingChange.oldFormula ?? '(empty)')}
                              </div>
                              <div className="text-emerald-200 font-mono mt-0.5 truncate">
                                → {String(pendingChange.newValue ?? pendingChange.newFormula ?? '')}
                              </div>
                            </div>
                          </>
                        )}
                        {cellData?.validationError && (
                          <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-red-500 border-l-[6px] border-l-transparent z-10"
                            title={cellData.validationError} />
                        )}
                        {cellData?.validation?.type === 'list' && !isEditing && (
                          <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">▾</div>
                        )}
                        {active && !isEditing && (
                          <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 cursor-crosshair z-20" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <FormulaAutocomplete
        visible={!!editingCell && editValue.startsWith('=')}
        editValue={editValue}
        onSelect={handleAutocompleteSelect}
        position={autocompletePos}
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
    </div>
  );
}
