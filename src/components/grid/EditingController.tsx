/**
 * EditingController - Handles inline cell editing state and logic.
 * Extracted from SpreadsheetGrid to isolate editing concerns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useStore } from '@/store/useStore';
import { cellToRef } from '@/engine/spreadsheet';

interface EditingControllerConfig {
  setEditingCell: (id: string | null) => void;
  setEditValue: (val: string) => void;
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void;
  pushHistory: (desc: string) => void;
  validateCellValue: (cellId: string, value: string | number | null) => { valid: boolean; message?: string };
  setSelection: (sel: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
}

export function useEditingController(config: EditingControllerConfig) {
  const {
    setEditingCell,
    setEditValue,
    setCellValue,
    pushHistory,
    validateCellValue,
    setSelection,
  } = config;

  const inputRef = useRef<HTMLInputElement>(null);
  const editContainerRef = useRef<HTMLDivElement>(null);
  const [autocompletePos, setAutocompletePos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const editingCell = useStore(s => s.editingCell);
  const editValue = useStore(s => s.editValue);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
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
    const cellVal = val.startsWith('=') ? null : (val !== '' && !isNaN(Number(val)) ? Number(val) : (val || null));
    const result = validateCellValue(editingCell, cellVal);
    
    const state = useStore.getState();
    const cell = state.getActiveSheet().cells[editingCell];
    if (cell) {
      if (!result.valid) {
        cell.validationError = result.message;
      } else {
        delete cell.validationError;
      }
    }

    setEditingCell(null);
    setEditValue('');
  }, [editingCell, editValue, pushHistory, setCellValue, setEditingCell, setEditValue, validateCellValue]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue('');
  }, [setEditingCell, setEditValue]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!editingCell) return;
    
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
  }, [editingCell, commitEdit, setSelection, setEditingCell, setEditValue]);

  const handleAutocompleteSelect = useCallback((functionName: string) => {
    if (!functionName) return;
    setEditValue('=' + functionName + '(');
  }, [setEditValue]);

  const startEdit = useCallback((cellId: string) => {
    const sheet = useStore.getState().getActiveSheet();
    const cellData = sheet.cells[cellId];
    setEditingCell(cellId);
    setEditValue(cellData?.formula || String(cellData?.value ?? ''));
    setSelection({ startRow: cellToRef(cellId).row, startCol: cellToRef(cellId).col, endRow: cellToRef(cellId).row, endCol: cellToRef(cellId).col });
    requestAnimationFrame(() => {
      if (editContainerRef.current) {
        editContainerRef.current.getBoundingClientRect();
        // Autocomplete position will be set by parent
      }
    });
  }, [setEditingCell, setEditValue, setSelection]);

  return {
    inputRef,
    editContainerRef,
    autocompletePos,
    setAutocompletePos,
    editingCell,
    editValue,
    setEditValue,
    commitEdit,
    cancelEdit,
    handleKeyDown,
    handleAutocompleteSelect,
    startEdit,
  };
}