import React, { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import type { DataValidation } from '@/types';
import { refToCell } from '@/engine/spreadsheet';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ValidationDialog({ isOpen, onClose }: Props) {
  const { selection, getActiveSheet, setCellValidation } = useStore();
  const sheet = getActiveSheet();
  const cellId = selection ? refToCell(selection.startRow, selection.startCol) : null;
  const existing = cellId ? sheet.cells[cellId]?.validation : undefined;

  const [type, setType] = useState<DataValidation['type']>('number');
  const [criteria, setCriteria] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [message, setMessage] = useState('');
  const [containsText, setContainsText] = useState('');

  useEffect(() => {
    if (existing) {
      setType(existing.type);
      setCriteria(existing.criteria || '');
      setValuesText(existing.values?.join(', ') || '');
      setMin(existing.min != null ? String(existing.min) : '');
      setMax(existing.max != null ? String(existing.max) : '');
      setMessage(existing.message || '');
      setContainsText(existing.containsText || '');
    } else {
      setType('number');
      setCriteria('');
      setValuesText('');
      setMin('');
      setMax('');
      setMessage('');
      setContainsText('');
    }
  }, [existing, isOpen]);

  if (!isOpen || !selection) return null;

  const handleApply = () => {
    if (!cellId) return;
    const validation: DataValidation = {
      type,
      criteria: criteria || undefined,
      values: type === 'list' ? valuesText.split(',').map(v => v.trim()).filter(Boolean) : undefined,
      min: min !== '' ? Number(min) : undefined,
      max: max !== '' ? Number(max) : undefined,
      message: message || undefined,
      containsText: (type === 'text' && (criteria === 'contains' || criteria === 'notContains' || criteria === 'startsWith' || criteria === 'endsWith'))
        ? containsText || undefined
        : undefined,
    };
    // Apply to all selected cells
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        setCellValidation(refToCell(r, c), validation);
      }
    }
    onClose();
  };

  const handleClear = () => {
    if (!cellId) return;
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        setCellValidation(refToCell(r, c), null);
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-96 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Validation</h3>

        <label className="block text-sm font-medium text-gray-700 mb-1">Allow:</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as DataValidation['type'])}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-3 text-sm"
        >
          <option value="number">Number</option>
          <option value="list">List (dropdown)</option>
          <option value="text">Text</option>
          <option value="date">Date</option>
          <option value="custom">Custom formula</option>
        </select>

        {type === 'number' && (
          <>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Min</label>
                <input type="number" value={min} onChange={e => setMin(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="No min" />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Max</label>
                <input type="number" value={max} onChange={e => setMax(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="No max" />
              </div>
            </div>
          </>
        )}

        {type === 'list' && (
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Values (comma-separated)</label>
            <input value={valuesText} onChange={e => setValuesText(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Option1, Option2, Option3" />
          </div>
        )}

        {type === 'text' && (
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Criteria</label>
            <select value={criteria} onChange={e => setCriteria(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Any text</option>
              <option value="length">Minimum length</option>
              <option value="contains">Contains text</option>
            </select>
            {criteria === 'length' && (
              <div className="flex gap-2 mt-2">
                <input type="number" value={min} onChange={e => setMin(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Min length" />
                <input type="number" value={max} onChange={e => setMax(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Max length" />
              </div>
            )}
            {criteria === 'contains' && (
              <input value={containsText} onChange={e => setContainsText(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-2" placeholder="Text to contain" />
            )}
          </div>
        )}

        {type === 'custom' && (
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Formula (returns true = valid)</label>
            <input value={criteria} onChange={e => setCriteria(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="value > 0" />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Error message (optional)</label>
          <input value={message} onChange={e => setMessage(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Custom error message" />
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={handleClear}
            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            Clear
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleApply}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
