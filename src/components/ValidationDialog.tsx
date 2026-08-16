import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { DataValidation } from '@/types';
import { refToCell } from '@/engine/spreadsheet';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

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

  useEscapeToClose(isOpen, onClose);

  if (!isOpen || !selection) return null;

  const handleApply = () => {
    if (!cellId) return;
    const validation: DataValidation = {
      type,
      criteria: type === 'checkbox' ? undefined : (criteria || undefined),
      values: type === 'list' ? valuesText.split(',').map(v => v.trim()).filter(Boolean) : undefined,
      min: min !== '' ? Number(min) : undefined,
      max: max !== '' ? Number(max) : undefined,
      message: message || undefined,
      containsText: (type === 'text' && (criteria === 'contains' || criteria === 'notContains' || criteria === 'startsWith' || criteria === 'endsWith'))
        ? containsText || undefined
        : undefined,
      checkedValue: type === 'checkbox' ? (criteria || 'TRUE') : undefined,
      uncheckedValue: type === 'checkbox' ? (containsText || 'FALSE') : undefined,
    };
    // Apply to all selected cells
    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const id = refToCell(r, c);
        setCellValidation(id, validation);
        // For checkbox type, also initialize the cell value if empty
        if (type === 'checkbox') {
          const cell = sheet.cells[id];
          if (!cell?.value) {
            useStore.getState().setCellValue(id, validation.uncheckedValue || 'FALSE');
          }
        }
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4" onClick={onClose} style={{ background: 'oklch(0.1 0.02 250 / 0.5)', backdropFilter: 'blur(3px)' }}>
      <div
        className="rounded-t-2xl md:rounded-xl shadow-2xl w-96 max-w-[calc(100vw-2rem)] max-h-[min(90dvh,100%)] overflow-y-auto p-6"
        style={{ background: 'var(--surface-panel)', boxShadow: '0 24px 48px oklch(0.1 0 0 / 0.18), 0 4px 12px oklch(0.1 0 0 / 0.08)' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="validation-dialog-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 id="validation-dialog-title" className="text-lg font-semibold" style={{ color: 'var(--ink-primary)' }}>Data Validation</h3>
          <button type="button" onClick={onClose} className="p-2.5 -mt-1 -mr-1 rounded-lg" style={{ color: 'var(--neutral-400)' }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-primary)' }}>Allow:</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as DataValidation['type'])}
          className="w-full border rounded-lg px-3 py-2 mb-3 text-sm outline-none transition-colors focus:ring-2"
          style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)', background: 'var(--surface-panel)' }}
        >
          <option value="number">Number</option>
          <option value="list">List (dropdown)</option>
          <option value="checkbox">Checkbox</option>
          <option value="text">Text</option>
          <option value="date">Date</option>
          <option value="custom">Custom formula</option>
        </select>

        {type === 'number' && (
          <>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Min</label>
                <input type="number" value={min} onChange={e => setMin(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="No min" />
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Max</label>
                <input type="number" value={max} onChange={e => setMax(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="No max" />
              </div>
            </div>
          </>
        )}

        {type === 'list' && (
          <div className="mb-3">
            <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Values (comma-separated)</label>
            <input value={valuesText} onChange={e => setValuesText(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="Option1, Option2, Option3" />
          </div>
        )}

        {type === 'checkbox' && (
          <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--neutral-100)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--ink-secondary)' }}>Cells will display as clickable checkboxes.</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Checked value</label>
                <input value={criteria || 'TRUE'} onChange={e => setCriteria(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)', background: 'var(--surface-panel)' }} placeholder="TRUE" />
              </div>
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Unchecked value</label>
                <input value={containsText || 'FALSE'} onChange={e => setContainsText(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)', background: 'var(--surface-panel)' }} placeholder="FALSE" />
              </div>
            </div>
          </div>
        )}

        {type === 'text' && (
          <div className="mb-3">
            <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Criteria</label>
            <select value={criteria} onChange={e => setCriteria(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)', background: 'var(--surface-panel)' }}>
              <option value="">Any text</option>
              <option value="length">Minimum length</option>
              <option value="contains">Contains text</option>
            </select>
            {criteria === 'length' && (
              <div className="flex gap-2 mt-2">
                <input type="number" value={min} onChange={e => setMin(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="Min length" />
                <input type="number" value={max} onChange={e => setMax(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="Max length" />
              </div>
            )}
            {criteria === 'contains' && (
              <input value={containsText} onChange={e => setContainsText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm mt-2 outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="Text to contain" />
            )}
          </div>
        )}

        {type === 'custom' && (
          <div className="mb-3">
            <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Formula (returns true = valid)</label>
            <input value={criteria} onChange={e => setCriteria(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="value > 0" />
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--ink-secondary)' }}>Error message (optional)</label>
          <input value={message} onChange={e => setMessage(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors focus:ring-2" style={{ borderColor: 'var(--neutral-200)', color: 'var(--ink-primary)' }} placeholder="Custom error message" />
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={handleClear}
            className="px-4 py-2 text-sm rounded-lg transition-colors" style={{ color: 'var(--error)' }}>
            Clear
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border transition-colors" style={{ color: 'var(--ink-secondary)', borderColor: 'var(--neutral-200)' }}>
            Cancel
          </button>
          <button type="button" onClick={handleApply}
            className="px-4 py-2 text-sm text-white rounded-lg transition-colors" style={{ background: 'var(--accent-600)' }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
