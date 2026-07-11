### Task 9: Pivot Table Configuration Dialog

**Files:**
- Create: `src/components/PivotDialog.tsx`
- Modify: `src/store/useStore.ts` (add showPivotDialog state)
- Modify: `src/App.tsx` (render PivotDialog)
- Modify: `src/components/ContextMenu.tsx` (add Pivot Table menu item)

**Interfaces:**
- Consumes: `PivotConfig`, `PivotField` types (from Task 8), `useStore` (getActiveSheet, selection, addSheet, setCellValue, engine)
- Produces: A dialog where users drag fields into Row/Column/Value areas to configure a pivot table

- [ ] **Step 1: Create PivotDialog component**

Create `src/components/PivotDialog.tsx` with the following content:

```tsx
import React, { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { colToLetter, refToCell } from '@/engine/spreadsheet';
import type { PivotConfig, PivotField } from '@/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function PivotDialog({ isOpen, onClose }: Props) {
  const { selection, getActiveSheet, engine } = useStore();
  const sheet = getActiveSheet();

  // Get column headers from first row of selection
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

  const [rowFields, setRowFields] = useState<string[]>([]);
  const [colFields, setColFields] = useState<string[]>([]);
  const [valueFields, setValueFields] = useState<{ col: string; agg: PivotField['aggregation'] }[]>([]);

  const [dragItem, setDragItem] = useState<{ col: string; source: 'available' | 'row' | 'col' | 'value' } | null>(null);

  const available = columns.filter(c =>
    !rowFields.includes(c.letter) && !colFields.includes(c.letter) && !valueFields.find(v => v.col === c.letter)
  );

  if (!isOpen || !selection) return null;

  const startRow = Math.min(selection.startRow, selection.endRow) + 1; // Skip header
  const endRow = Math.max(selection.startRow, selection.endRow);
  const startCol = Math.min(selection.startCol, selection.endCol);
  const endCol = Math.max(selection.startCol, selection.endCol);

  const handleGenerate = () => {
    if (valueFields.length === 0) return;

    const config: PivotConfig = {
      sourceSheetId: sheet.id,
      sourceRange: { startRow, endRow, startCol, endCol },
      rows: rowFields.map(col => ({ sourceColumn: col, aggregation: 'sum' as const })),
      columns: colFields.map(col => ({ sourceColumn: col, aggregation: 'sum' as const })),
      values: valueFields.map(v => ({ sourceColumn: v.col, aggregation: v.agg })),
    };

    if (!engine) return;
    const result = engine.computePivotTable(sheet.cells, config, startRow, endRow, startCol, endCol);

    // Create new sheet for pivot table
    const store = useStore.getState();
    store.addSheet('Pivot Table');

    // Write headers
    result.headers.forEach((h, i) => {
      store.setCellValue(refToCell(0, i), String(h));
    });
    // Write data rows
    result.rows.forEach((row, ri) => {
      row.forEach((val, ci) => {
        store.setCellValue(refToCell(ri + 1, ci), val);
      });
    });
    // Format headers
    store.setRangeFormat({ bold: true, bgColor: '#e0e7ff', fontColor: '#3730a3' });
    // Re-select from A1
    store.setSelection({ startRow: 0, startCol: 0, endRow: 0, endCol: result.headers.length - 1 });

    onClose();
  };

  const FieldPill = ({ col, header, onRemove }: { col: string; header: string; onRemove: () => void }) => (
    <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs flex items-center gap-1 shadow-sm">
      <span className="font-medium">{header}</span>
      <button onClick={onRemove} className="text-gray-400 hover:text-red-500 text-[10px] ml-1">✕</button>
    </div>
  );

  const DropZone = ({
    label, items, onDrop, onRemove, color
  }: {
    label: string; items: { col: string; header: string }[];
    onDrop: (col: string) => void; onRemove: (col: string) => void; color: string;
  }) => (
    <div
      className={`min-h-[60px] border-2 border-dashed rounded-lg p-2 transition-colors ${
        dragItem ? `border-${color}-400 bg-${color}-50/30` : 'border-gray-200 bg-gray-50/50'
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); if (dragItem) onDrop(dragItem.col); setDragItem(null); }}
    >
      <div className={`text-[10px] font-medium text-${color}-500 uppercase tracking-wide mb-1.5`}>{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 && <span className="text-[11px] text-gray-400">Drag fields here</span>}
        {items.map(item => (
          <FieldPill key={item.col} col={item.col} header={item.header} onRemove={() => onRemove(item.col)} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[520px] p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Create Pivot Table</h3>
        <p className="text-xs text-gray-500 mb-4">
          Drag fields into the areas below. Values are aggregated (sum by default).
        </p>

        {/* Available Fields */}
        <div className="mb-4">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Available Fields</div>
          <div className="flex flex-wrap gap-1.5 min-h-[32px] bg-gray-50 border border-gray-200 rounded-lg p-2">
            {available.map(c => (
              <div
                key={c.letter}
                draggable
                onDragStart={() => setDragItem({ col: c.letter, source: 'available' })}
                className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs cursor-grab hover:bg-blue-100 transition-colors font-medium text-blue-700"
              >
                {c.header}
              </div>
            ))}
            {available.length === 0 && <span className="text-[11px] text-gray-400">All fields assigned</span>}
          </div>
        </div>

        {/* Drop Zones */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <DropZone
            label="Row Labels"
            items={rowFields.map(col => ({ col, header: columns.find(c => c.letter === col)?.header || col }))}
            onDrop={(col) => setRowFields(prev => [...prev, col])}
            onRemove={(col) => setRowFields(prev => prev.filter(c => c !== col))}
            color="green"
          />
          <DropZone
            label="Column Labels"
            items={colFields.map(col => ({ col, header: columns.find(c => c.letter === col)?.header || col }))}
            onDrop={(col) => setColFields(prev => [...prev, col])}
            onRemove={(col) => setColFields(prev => prev.filter(c => c !== col))}
            color="purple"
          />
          <DropZone
            label="Values"
            items={valueFields.map(v => ({ col: v.col, header: columns.find(c => c.letter === v.col)?.header || v.col }))}
            onDrop={(col) => setValueFields(prev => [...prev, { col, agg: 'sum' }])}
            onRemove={(col) => setValueFields(prev => prev.filter(v => v.col !== col))}
            color="orange"
          />
        </div>

        {/* Aggregation selector for value fields */}
        {valueFields.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Value Aggregation</div>
            <div className="space-y-1.5">
              {valueFields.map((vf, i) => (
                <div key={vf.col} className="flex items-center gap-2">
                  <span className="text-xs text-gray-700 w-32 truncate">{columns.find(c => c.letter === vf.col)?.header}</span>
                  <select
                    value={vf.agg}
                    onChange={e => {
                      const newVfs = [...valueFields];
                      newVfs[i] = { ...newVfs[i], agg: e.target.value as PivotField['aggregation'] };
                      setValueFields(newVfs);
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

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={valueFields.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Generate Pivot Table
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add showPivotDialog state to store**

In `src/store/useStore.ts` `AppState` interface, add:
```typescript
showPivotDialog: boolean;
setShowPivotDialog: (show: boolean) => void;
```

In the store implementation, add:
```typescript
showPivotDialog: false,
setShowPivotDialog: (show) => set({ showPivotDialog: show }),
```

- [ ] **Step 3: Add PivotDialog to App.tsx**

In `src/App.tsx`, import and render:
```typescript
import { PivotDialog } from './components/PivotDialog';
```

Add `<PivotDialog isOpen={showPivotDialog} onClose={() => setShowPivotDialog(false)} />` alongside the other dialogs.

You'll need to destructure `showPivotDialog` and `setShowPivotDialog` from the store in the App component.

- [ ] **Step 4: Add "Pivot Table" to ContextMenu**

In `src/components/ContextMenu.tsx`, add a new menu item:
```tsx
<div className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
  onClick={() => { useStore.getState().setShowPivotDialog(true); onClose(); }}>
  <span>📊</span> Pivot Table
</div>
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All 14 tests pass
