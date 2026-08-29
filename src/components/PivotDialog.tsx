import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell } from '@/engine/spreadsheet';
import type { PivotConfig, PivotField } from '@/types';
import {
  assignPivotField,
  unassignPivotField,
  EMPTY_PIVOT_ASSIGN,
  type PivotAssignState,
  type PivotZone,
} from '@/lib/pivotFieldAssign';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function PivotDialog({ isOpen, onClose }: Props) {
  const { selection, getActiveSheet, engine } = useStore();
  const sheet = getActiveSheet();

  const columns = useMemo(() => {
    if (!selection) return [];
    const startCol = Math.min(selection.startCol, selection.endCol);
    const endCol = Math.max(selection.startCol, selection.endCol);
    const headerRow = Math.min(selection.startRow, selection.endRow);
    const cols: { letter: string; header: string }[] = [];
    for (let c = startCol; c <= endCol; c++) {
      const cellId = refToCell(headerRow, c);
      const val = sheet.cells[cellId]?.value;
      cols.push({ letter: colToLetter(c), header: String(val ?? colToLetter(c)) });
    }
    return cols;
  }, [selection, sheet.cells]);

  const [layout, setLayout] = useState<PivotAssignState>(EMPTY_PIVOT_ASSIGN);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);

  const { rowFields, colFields, valueFields } = layout;

  const available = columns.filter((c) =>
    !rowFields.includes(c.letter) && !colFields.includes(c.letter) && !valueFields.find((v) => v.col === c.letter)
  );

  const containerRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setLayout(EMPTY_PIVOT_ASSIGN);
    setDragItem(null);
    setHasHeader(true);
  }, [isOpen]);

  if (!isOpen || !selection) return null;

  const startRowBase = Math.min(selection.startRow, selection.endRow);
  const startRow = hasHeader ? startRowBase + 1 : startRowBase;
  const endRow = Math.max(selection.startRow, selection.endRow);
  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);

  const assign = (col: string, zone: PivotZone) => {
    setLayout((prev) => assignPivotField(prev, col, zone));
    setDragItem(null);
  };

  const handleGenerate = () => {
    if (valueFields.length === 0) return;

    const config: PivotConfig = {
      sourceSheetId: sheet.id,
      sourceRange: { startRow, endRow, startCol, endCol },
      rows: rowFields.map((col) => ({ sourceColumn: col, aggregation: 'sum' as const })),
      columns: colFields.map((col) => ({ sourceColumn: col, aggregation: 'sum' as const })),
      values: valueFields.map((v) => ({ sourceColumn: v.col, aggregation: v.agg })),
      hasHeader,
    };

    if (!engine) return;
    const result = engine.computePivotTable(sheet.cells, config, startRow, endRow, startCol, endCol);

    const store = useStore.getState();
    store.addSheet('Pivot Table');

    result.headers.forEach((h, i) => {
      store.setCellValue(refToCell(0, i), String(h));
    });
    result.rows.forEach((row, ri) => {
      row.forEach((val, ci) => {
        store.setCellValue(refToCell(ri + 1, ci), val);
      });
    });
    store.setRangeFormat({ bold: true, bgColor: '#e0e7ff', fontColor: '#3730a3' });
    store.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: result.headers.length - 1 });

    onClose();
  };

  const FieldPill = ({ col, header }: { col: string; header: string }) => (
    <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs flex items-center gap-1 shadow-sm">
      <span className="font-medium">{header}</span>
      <button
        type="button"
        onClick={() => setLayout((prev) => unassignPivotField(prev, col))}
        className="text-gray-400 hover:text-red-500 text-xs ml-1 min-w-[28px] min-h-[28px]"
        aria-label={`Remove ${header}`}
      >
        ✕
      </button>
    </div>
  );

  const DropZone = ({
    label, items, zone, color,
  }: {
    label: string;
    items: { col: string; header: string }[];
    zone: PivotZone;
    color: string;
  }) => (
    <div
      className={`min-h-[60px] border-2 border-dashed rounded-lg p-2 transition-colors ${
        dragItem ? `border-${color}-400 bg-${color}-50/30` : 'border-gray-200 bg-gray-50/50'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (dragItem) assign(dragItem, zone);
      }}
    >
      <div className={`text-[10px] font-medium text-${color}-500 uppercase tracking-wide mb-1.5`}>{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 && (
          <span className="text-[11px] text-gray-400">Tap Rows / Cols / Values on a field below</span>
        )}
        {items.map((item) => (
          <FieldPill key={item.col} col={item.col} header={item.header} />
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4"
      role="presentation"
    >
      <div
        ref={containerRef}
        className="bg-white rounded-t-2xl md:rounded-xl shadow-2xl w-full md:w-[520px] max-w-full max-h-[min(92dvh,100%)] overflow-y-auto p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pivot-dialog-title"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 id="pivot-dialog-title" data-focus-on-open tabIndex={-1} className="text-lg font-semibold text-gray-900">Create Pivot Table</h3>
            <p className="text-xs text-gray-500 mt-1">
              Tap Rows, Columns, or Values on a field. Drag still works on desktop.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          <DropZone
            label="Row Labels"
            zone="row"
            items={rowFields.map((col) => ({ col, header: columns.find((c) => c.letter === col)?.header || col }))}
            color="green"
          />
          <DropZone
            label="Column Labels"
            zone="col"
            items={colFields.map((col) => ({ col, header: columns.find((c) => c.letter === col)?.header || col }))}
            color="purple"
          />
          <DropZone
            label="Values"
            zone="value"
            items={valueFields.map((v) => ({ col: v.col, header: columns.find((c) => c.letter === v.col)?.header || v.col }))}
            color="orange"
          />
        </div>

        <div className="mb-4">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Available Fields</div>
          <div className="flex flex-col gap-2 min-h-[32px] bg-gray-50 border border-gray-200 rounded-lg p-2">
            {available.map((c) => (
              <div
                key={c.letter}
                draggable
                onDragStart={() => setDragItem(c.letter)}
                className="flex flex-wrap items-center gap-2 bg-white border border-blue-200 rounded-lg px-2 py-1.5"
              >
                <span className="text-xs font-medium text-blue-700 flex-1 min-w-0 truncate">{c.header}</span>
                <div className="flex gap-1">
                  {(['row', 'col', 'value'] as const).map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => assign(c.letter, zone)}
                      className="px-2 py-1 text-[11px] rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-blue-50"
                    >
                      {zone === 'row' ? 'Rows' : zone === 'col' ? 'Cols' : 'Values'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {available.length === 0 && <span className="text-[11px] text-gray-400">All fields assigned</span>}
          </div>
        </div>

        {valueFields.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Value Aggregation</div>
            <div className="space-y-1.5">
              {valueFields.map((vf, i) => (
                <div key={vf.col} className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 w-32 truncate">{columns.find((c) => c.letter === vf.col)?.header}</span>
                  <select
                    value={vf.agg}
                    onChange={(e) => {
                      const agg = e.target.value as PivotField['aggregation'];
                      setLayout((prev) => {
                        const next = [...prev.valueFields];
                        next[i] = { ...next[i], agg };
                        return { ...prev, valueFields: next };
                      });
                    }}
                    className="border border-gray-200 rounded px-2 py-1 text-xs"
                  >
                    <option value="sum">Sum</option>
                    <option value="count">Count</option>
                    <option value="average">Average</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                    <option value="distinctCount">Distinct Count</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
          <input
            type="checkbox"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          First row is header
        </label>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={valueFields.length === 0}
            className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Generate Pivot Table
          </button>
        </div>
      </div>
    </div>
  );
}
