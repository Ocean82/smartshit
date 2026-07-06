import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell, cellToRef } from '@/engine/spreadsheet';
import type { CellFormat } from '@/types';

const DEFAULT_CELL_WIDTH = 100;
const CELL_HEIGHT = 28;
const ROW_HEADER_WIDTH = 46;
const COL_HEADER_HEIGHT = 26;
const VISIBLE_ROWS = 60;
const VISIBLE_COLS = 26;

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
  } = useStore();

  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({});
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  const sheet = getActiveSheet();

  const getColWidth = useCallback((col: number) => {
    return columnWidths[col] || sheet.columnWidths[col] || DEFAULT_CELL_WIDTH;
  }, [columnWidths, sheet.columnWidths]);

  // Determine column offsets for positioning
  const colOffsets = useMemo(() => {
    const offsets: number[] = [0];
    for (let i = 0; i < VISIBLE_COLS; i++) {
      offsets.push(offsets[i] + getColWidth(i));
    }
    return offsets;
  }, [getColWidth]);

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
        break;
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          const cellId = refToCell(r, c);
          setEditingCell(cellId);
          setEditValue(e.key);
        }
        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'z': e.preventDefault(); useStore.getState().undo(); break;
            case 'y': e.preventDefault(); useStore.getState().redo(); break;
            case 'c': e.preventDefault(); useStore.getState().copy(); break;
            case 'x': e.preventDefault(); useStore.getState().cut(); break;
            case 'v': e.preventDefault(); useStore.getState().paste(); break;
            case 'b': e.preventDefault(); useStore.getState().setRangeFormat({ bold: true }); break;
            case 'i': e.preventDefault(); useStore.getState().setRangeFormat({ italic: true }); break;
          }
        }
    }
  }, [editingCell, selection, sheet.cells, commitEdit, pushHistory, setCellValue, setSelection, setEditingCell, setEditValue]);

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

  const getCellStyle = useCallback((format: CellFormat | undefined): React.CSSProperties => {
    if (!format) return {};
    return {
      fontWeight: format.bold ? 700 : undefined,
      fontStyle: format.italic ? 'italic' : undefined,
      textDecoration: format.underline ? 'underline' : undefined,
      fontSize: format.fontSize ? `${format.fontSize}px` : undefined,
      color: format.fontColor || undefined,
      backgroundColor: format.bgColor || undefined,
      textAlign: format.textAlign || undefined,
    };
  }, []);

  // Select all cells in a row
  const handleRowSelect = useCallback((row: number) => {
    setSelection({ startRow: row, startCol: 0, endRow: row, endCol: VISIBLE_COLS - 1 });
  }, [setSelection]);

  // Select all cells in a column
  const handleColSelect = useCallback((col: number) => {
    setSelection({ startRow: 0, startCol: col, endRow: VISIBLE_ROWS - 1, endCol: col });
  }, [setSelection]);

  return (
    <div
      ref={gridRef}
      className="flex-1 overflow-auto relative"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={handleMouseUp}
      style={{ outline: 'none', userSelect: 'none' }}
    >
      <div style={{ minWidth: ROW_HEADER_WIDTH + colOffsets[VISIBLE_COLS] + 20 }}>
        {/* Column headers */}
        <div className="flex sticky top-0 z-20">
          <div
            className="bg-gradient-to-b from-gray-100 to-gray-150 border-b border-r border-gray-300 flex items-center justify-center text-[10px] text-gray-400 font-medium shrink-0 sticky left-0 z-30"
            style={{ width: ROW_HEADER_WIDTH, height: COL_HEADER_HEIGHT }}
            onClick={() => setSelection({ startRow: 0, startCol: 0, endRow: VISIBLE_ROWS - 1, endCol: VISIBLE_COLS - 1 })}
          >
            ▾
          </div>
          {Array.from({ length: VISIBLE_COLS }, (_, i) => {
            const isColSelected = selection &&
              i >= Math.min(selection.startCol, selection.endCol) &&
              i <= Math.max(selection.startCol, selection.endCol);
            return (
              <div
                key={i}
                className={`border-b border-r border-gray-300 flex items-center justify-center text-[11px] font-medium shrink-0 relative group cursor-pointer transition-colors ${
                  isColSelected
                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                    : 'bg-gradient-to-b from-gray-50 to-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                style={{ width: getColWidth(i), height: COL_HEADER_HEIGHT }}
                onClick={() => handleColSelect(i)}
              >
                {colToLetter(i)}
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 opacity-0 group-hover:opacity-100 z-10"
                  onMouseDown={(e) => handleResizeStart(i, e)}
                />
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {Array.from({ length: VISIBLE_ROWS }, (_, rowIdx) => {
          const row = rowIdx;
          const isRowSelected = selection &&
            row >= Math.min(selection.startRow, selection.endRow) &&
            row <= Math.max(selection.startRow, selection.endRow);
          return (
            <div key={row} className="flex" style={{ height: CELL_HEIGHT }}>
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
              {Array.from({ length: VISIBLE_COLS }, (_, colIdx) => {
                const col = colIdx;
                const cellId = refToCell(row, col);
                const cellData = sheet.cells[cellId];
                const selected = isSelected(row, col);
                const active = isActiveCell(row, col);
                const isEditing = editingCell === cellId;
                const computed = getComputedValue(row, col);
                const displayVal = computed || (cellData?.value != null ? String(cellData.value) : '');
                const hasFormula = !!cellData?.formula;
                const colWidth = getColWidth(col);

                return (
                  <div
                    key={col}
                    className={`border-b border-r shrink-0 relative transition-shadow ${
                      active
                        ? 'ring-2 ring-blue-500 ring-inset z-10 bg-white'
                        : selected
                          ? 'bg-blue-50/60 border-blue-200'
                          : 'border-gray-200 hover:bg-blue-50/20'
                    }`}
                    style={{
                      width: colWidth,
                      height: CELL_HEIGHT,
                      ...(selected && !active ? {} : getCellStyle(cellData?.format)),
                      ...(active ? getCellStyle(cellData?.format) : {}),
                    }}
                    onMouseDown={(e) => handleMouseDown(row, col, e)}
                    onMouseMove={() => handleMouseMove(row, col)}
                    onDoubleClick={() => handleCellDoubleClick(row, col)}
                    onContextMenu={(e) => handleContextMenu(e, row, col)}
                  >
                    {isEditing ? (
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
                          title={hasFormula ? `${cellData?.formula} = ${displayVal}` : displayVal}
                        >
                          {displayVal}
                        </div>
                      </div>
                    )}
                    {/* Active cell resize handle */}
                    {active && !isEditing && (
                      <div className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 cursor-crosshair z-20" />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
