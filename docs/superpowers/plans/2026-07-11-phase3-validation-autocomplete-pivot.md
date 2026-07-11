# Phase 3: Data Validation, Formula Autocomplete, Pivot Tables

> **Status: Implemented (2026-07-11).** Tasks 1–11 completed; see `.superpowers/sdd/task-*-report.md`. Historical checkboxes below are retained for audit trail.
>
> **Task status: all complete.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three professional-grade spreadsheet features — data validation with dropdowns/error indicators, formula autocomplete with function metadata from HyperFormula, and pivot tables with drag-and-drop field configuration.

**Architecture:** Each feature is independent and can be implemented in any order. Data validation extends the existing `DataValidation` type stub. Formula autocomplete extracts function metadata from the HyperFormula instance and renders a suggestion popup overlaying the cell editor. Pivot tables create a new sheet type with aggregated data computed from a source range.

**Tech Stack:** React, Zustand, HyperFormula v3.3.0, TypeScript, Tailwind CSS

## Global Constraints

- Virtual scrolling grid: 1000 rows × 100 cols, buffer zones (5 rows, 3 cols)
- HyperFormula v3.3.0 (GPL-v3) — 380+ built-in functions, already loaded
- Zustand store pattern — all state mutations go through `useStore`
- Existing `DataValidation` type at `src/types/index.ts:34-41` — must use this interface
- No new npm dependencies — build with React + Tailwind only
- Tests: 14 existing tests must continue passing (`npm test`)
- Build: `npx tsc --noEmit` and `npx vite build` must succeed

---

## Feature A: Data Validation

### Task 1: Store Actions for Validation

**Files:**
- Modify: `src/store/useStore.ts` (add actions to `AppState` interface + implementation)

**Interfaces:**
- Consumes: `DataValidation` type from `src/types/index.ts:34-41`, `CellData.validation` from `src/types/index.ts:6`
- Produces: `setCellValidation(cellId, validation)`, `clearCellValidation(cellId)`, `getCellValidation(cellId)`, `validateCellValue(cellId, value): { valid: boolean; message?: string }`

- [x] **Step 1: Add validation actions to AppState interface**

In `src/store/useStore.ts`, add to the `AppState` interface (after the existing `setContextMenu` action around line 155):

```typescript
setCellValidation: (cellId: string, validation: DataValidation | null) => void;
validateCellValue: (cellId: string, value: string | number | null) => { valid: boolean; message?: string };
```

- [ ] **Step 2: Implement validation actions in the store**

In the `useStore` create function, add after the `setContextMenu` implementation:

```typescript
setCellValidation: (cellId, validation) => {
  const sheet = get().getActiveSheet();
  const cell = sheet.cells[cellId] || { value: null };
  sheet.cells[cellId] = { ...cell, validation: validation || undefined };
  set({ workbook: { ...get().workbook } });
},

validateCellValue: (cellId, value) => {
  const sheet = get().getActiveSheet();
  const cell = sheet.cells[cellId];
  if (!cell?.validation) return { valid: true };
  const v = cell.validation;
  const strVal = value == null ? '' : String(value);

  switch (v.type) {
    case 'number': {
      const num = Number(strVal);
      if (strVal !== '' && isNaN(num)) return { valid: false, message: v.message || 'Must be a number' };
      if (v.min != null && num < v.min) return { valid: false, message: v.message || `Must be ≥ ${v.min}` };
      if (v.max != null && num > v.max) return { valid: false, message: v.message || `Must be ≤ ${v.max}` };
      return { valid: true };
    }
    case 'list': {
      if (strVal !== '' && v.values && !v.values.includes(strVal))
        return { valid: false, message: v.message || `Must be one of: ${v.values.join(', ')}` };
      return { valid: true };
    }
    case 'text': {
      if (v.criteria === 'length' && v.min != null && strVal.length < v.min)
        return { valid: false, message: v.message || `Must be at least ${v.min} characters` };
      if (v.criteria === 'length' && v.max != null && strVal.length > v.max)
        return { valid: false, message: v.message || `Must be at most ${v.max} characters` };
      if (v.criteria === 'contains' && v.criteria && !strVal.includes(v.criteria))
        return { valid: false, message: v.message || `Must contain "${v.criteria}"` };
      return { valid: true };
    }
    case 'date': {
      if (strVal !== '' && isNaN(Date.parse(strVal)))
        return { valid: false, message: v.message || 'Must be a valid date' };
      return { valid: true };
    }
    case 'custom': {
      if (!v.criteria) return { valid: true };
      try {
        const fn = new Function('value', `return ${v.criteria}`);
        return fn(value) ? { valid: true } : { valid: false, message: v.message || 'Custom validation failed' };
      } catch {
        return { valid: true };
      }
    }
    default:
      return { valid: true };
  }
},
```

- [ ] **Step 3: Validate on cell value commit**

In `SpreadsheetGrid.tsx`, update the `commitEdit` callback (around line 53) to run validation after setting the value. After the existing `setCellValue` calls and before `setEditingCell(null)`, add:

```typescript
// After the existing setCellValue calls, before setEditingCell(null):
const { validateCellValue } = useStore.getState();
const result = validateCellValue(editingCell, val);
if (!result.valid) {
  // Mark cell with a red indicator (store validation error state)
  const errSheet = get().getActiveSheet();
  const errCell = errSheet.cells[editingCell];
  if (errCell) errCell.validationError = result.message;
  set({ workbook: { ...get().workbook } });
} else {
  const errSheet = get().getActiveSheet();
  const errCell = errSheet.cells[editingCell];
  if (errCell) delete errCell.validationError;
  set({ workbook: { ...get().workbook } });
}
```

- [ ] **Step 4: Add `validationError` to CellData type**

In `src/types/index.ts`, add to the `CellData` interface after the `validation` field:

```typescript
validationError?: string;
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

### Task 2: Validation Dialog Component

**Files:**
- Create: `src/components/ValidationDialog.tsx`

**Interfaces:**
- Consumes: `DataValidation` type, `useStore` (getCell, setCellValidation, selection)
- Produces: A modal dialog for configuring data validation rules on selected cells

- [x] **Step 1: Create ValidationDialog component**

```tsx
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

  useEffect(() => {
    if (existing) {
      setType(existing.type);
      setCriteria(existing.criteria || '');
      setValuesText(existing.values?.join(', ') || '');
      setMin(existing.min != null ? String(existing.min) : '');
     setMax(existing.max != null ? String(existing.max) : '');
      setMessage(existing.message || '');
    } else {
      setType('number');
      setCriteria('');
      setValuesText('');
      setMin('');
      setMax('');
      setMessage('');
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
              <input value={message} onChange={e => setMessage(e.target.value)}
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
```

- [ ] **Step 2: Add showValidationDialog state and toggle to store**

In `src/store/useStore.ts` `AppState` interface, add:
```typescript
showValidationDialog: boolean;
setShowValidationDialog: (show: boolean) => void;
```

In the store implementation, add:
```typescript
showValidationDialog: false,
setShowValidationDialog: (show) => set({ showValidationDialog: show }),
```

- [ ] **Step 3: Add Validation Dialog to App.tsx**

In `src/App.tsx`, import and render the dialog:
```typescript
import { ValidationDialog } from './components/ValidationDialog';
```

Add `<ValidationDialog isOpen={showValidationDialog} onClose={() => setShowValidationDialog(false)} />` alongside the existing dialogs (ChartDialog, FormatPanel, etc.).

- [ ] **Step 4: Add "Data Validation" to ContextMenu**

In `src/components/ContextMenu.tsx`, add a new menu item after the existing items:
```tsx
<div className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
  onClick={() => { useStore.getState().setShowValidationDialog(true); onClose(); }}>
  <span>🛡️</span> Data Validation
</div>
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

### Task 3: Visual Validation Indicators in Grid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `CellData.validation`, `CellData.validationError` from types
- Produces: Red triangle indicator on cells with validation errors, dropdown arrow on list-validated cells

- [x] **Step 1: Add validation indicators to cell rendering**

In `SpreadsheetGrid.tsx`, inside the cell `<div>` rendering (around line 422-471), after the display value `<div>` and before the active cell handle, add:

```tsx
{/* Validation error indicator */}
{cellData?.validationError && (
  <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-red-500 border-l-[6px] border-l-transparent z-10"
    title={cellData.validationError} />
)}
{/* List validation dropdown indicator */}
{cellData?.validation?.type === 'list' && !isEditing && (
  <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">▾</div>
)}
```

- [ ] **Step 2: Render list dropdown when editing list-validated cells**

In the editing `<input>` section (around line 445-452), when `cellData?.validation?.type === 'list'`, replace the `<input>` with a `<select>`:

```tsx
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
  <input ... />
) : ( ... )}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

## Feature B: Formula Autocomplete

### Task 4: Extract Function Metadata from HyperFormula

**Files:**
- Modify: `src/engine/spreadsheet.ts`

**Interfaces:**
- Consumes: HyperFormula instance (already loaded)
- Produces: `getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }>` and `getFunctionInfo(name: string)`

- [x] **Step 1: Add function metadata methods to SpreadsheetEngine**

In `src/engine/spreadsheet.ts`, add these methods to the `SpreadsheetEngine` class:

```typescript
getFunctionList(): Array<{ name: string; description: string; category: string; syntax: string }> {
  if (!this.hf) return [];
  try {
    // HyperFormula v3.x API — get built-in function names
    const builtIn = (this.hf as any).constructor?.defaultConfig?.functionRegistry;
    if (!builtIn) {
      // Fallback: curated list of most common functions
      return this.getFallbackFunctions();
    }
    // If HyperFormula exposes function metadata, use it
    return Object.entries(builtIn).map(([name, info]: [string, any]) => ({
      name: name.toUpperCase(),
      description: info.description || '',
      category: info.category || 'General',
      syntax: info.syntax || name.toUpperCase() + '()',
    }));
  } catch {
    return this.getFallbackFunctions();
  }
}

getFunctionInfo(name: string): { name: string; description: string; category: string; syntax: string } | null {
  const fns = this.getFunctionList();
  return fns.find(f => f.name === name.toUpperCase()) || null;
}

private getFallbackFunctions(): Array<{ name: string; description: string; category: string; syntax: string }> {
  return [
    { name: 'SUM', description: 'Adds its arguments', category: 'Math', syntax: 'SUM(number1, [number2], ...)' },
    { name: 'AVERAGE', description: 'Returns the average of its arguments', category: 'Statistical', syntax: 'AVERAGE(number1, [number2], ...)' },
    { name: 'COUNT', description: 'Counts how many numbers are in the list of arguments', category: 'Statistical', syntax: 'COUNT(value1, [value2], ...)' },
    { name: 'COUNTA', description: 'Counts how many values are in the list of arguments', category: 'Statistical', syntax: 'COUNTA(value1, [value2], ...)' },
    { name: 'MAX', description: 'Returns the largest value', category: 'Statistical', syntax: 'MAX(number1, [number2], ...)' },
    { name: 'MIN', description: 'Returns the smallest value', category: 'Statistical', syntax: 'MIN(number1, [number2], ...)' },
    { name: 'IF', description: 'Specifies a logical test to perform', category: 'Logical', syntax: 'IF(condition, true_value, [false_value])' },
    { name: 'AND', description: 'Returns TRUE if all arguments are TRUE', category: 'Logical', syntax: 'AND(logical1, [logical2], ...)' },
    { name: 'OR', description: 'Returns TRUE if any argument is TRUE', category: 'Logical', syntax: 'OR(logical1, [logical2], ...)' },
    { name: 'NOT', description: 'Reverses the logical value', category: 'Logical', syntax: 'NOT(logical)' },
    { name: 'CONCATENATE', description: 'Joins several text strings into one', category: 'Text', syntax: 'CONCATENATE(text1, [text2], ...)' },
    { name: 'LEFT', description: 'Returns the leftmost characters', category: 'Text', syntax: 'LEFT(text, [num_chars])' },
    { name: 'RIGHT', description: 'Returns the rightmost characters', category: 'Text', syntax: 'RIGHT(text, [num_chars])' },
    { name: 'MID', description: 'Returns a specific number of characters from a text string', category: 'Text', syntax: 'MID(text, start_num, num_chars)' },
    { name: 'LEN', description: 'Returns the number of characters', category: 'Text', syntax: 'LEN(text)' },
    { name: 'TRIM', description: 'Removes spaces from text', category: 'Text', syntax: 'TRIM(text)' },
    { name: 'UPPER', description: 'Converts text to uppercase', category: 'Text', syntax: 'UPPER(text)' },
    { name: 'LOWER', description: 'Converts text to lowercase', category: 'Text', syntax: 'LOWER(text)' },
    { name: 'VLOOKUP', description: 'Looks for a value in the leftmost column', category: 'Lookup', syntax: 'VLOOKUP(lookup_value, table_array, col_index, [range_lookup])' },
    { name: 'HLOOKUP', description: 'Looks for a value in the top row', category: 'Lookup', syntax: 'HLOOKUP(lookup_value, table_array, row_index, [range_lookup])' },
    { name: 'INDEX', description: 'Returns a value from a position', category: 'Lookup', syntax: 'INDEX(array, row_num, [column_num])' },
    { name: 'MATCH', description: 'Returns an item position in a range', category: 'Lookup', syntax: 'MATCH(lookup_value, lookup_array, [match_type])' },
    { name: 'SUMIF', description: 'Adds cells that meet a condition', category: 'Math', syntax: 'SUMIF(range, criteria, [sum_range])' },
    { name: 'COUNTIF', description: 'Counts cells that meet a condition', category: 'Statistical', syntax: 'COUNTIF(range, criteria)' },
    { name: 'ROUND', description: 'Rounds a number to specified digits', category: 'Math', syntax: 'ROUND(number, num_digits)' },
    { name: 'ABS', description: 'Returns the absolute value', category: 'Math', syntax: 'ABS(number)' },
    { name: 'CEILING', description: 'Rounds up to nearest multiple', category: 'Math', syntax: 'CEILING(number, significance)' },
    { name: 'FLOOR', description: 'Rounds down to nearest multiple', category: 'Math', syntax: 'FLOOR(number, significance)' },
    { name: 'NOW', description: 'Returns current date and time', category: 'Date/Time', syntax: 'NOW()' },
    { name: 'TODAY', description: 'Returns current date', category: 'Date/Time', syntax: 'TODAY()' },
    { name: 'DATE', description: 'Creates a date from year, month, day', category: 'Date/Time', syntax: 'DATE(year, month, day)' },
    { name: 'YEAR', description: 'Returns the year from a date', category: 'Date/Time', syntax: 'YEAR(serial_number)' },
    { name: 'MONTH', description: 'Returns the month from a date', category: 'Date/Time', syntax: 'MONTH(serial_number)' },
    { name: 'DAY', description: 'Returns the day from a date', category: 'Date/Time', syntax: 'DAY(serial_number)' },
    { name: 'ROWS', description: 'Returns the number of rows', category: 'Lookup', syntax: 'ROWS(array)' },
    { name: 'COLUMNS', description: 'Returns the number of columns', category: 'Lookup', syntax: 'COLUMNS(array)' },
    { name: 'PI', description: 'Returns the value of pi', category: 'Math', syntax: 'PI()' },
    { name: 'POWER', description: 'Returns a number raised to a power', category: 'Math', syntax: 'POWER(number, power)' },
    { name: 'SQRT', description: 'Returns a positive square root', category: 'Math', syntax: 'SQRT(number)' },
    { name: 'MOD', description: 'Returns the remainder after division', category: 'Math', syntax: 'MOD(number, divisor)' },
    { name: 'INT', description: 'Rounds down to nearest integer', category: 'Math', syntax: 'INT(number)' },
    { name: 'AVERAGEIF', description: 'Returns average of cells meeting criteria', category: 'Statistical', syntax: 'AVERAGEIF(range, criteria, [average_range])' },
    { name: 'SUMPRODUCT', description: 'Returns sum of products', category: 'Math', syntax: 'SUMPRODUCT(array1, [array2], ...)' },
  ];
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

### Task 5: Formula Autocomplete Popup Component

**Files:**
- Create: `src/components/FormulaAutocomplete.tsx`

**Interfaces:**
- Consumes: `SpreadsheetEngine.getFunctionList()`, current `editValue` from store
- Produces: A popup that appears when user types `=` in a cell, showing filtered function suggestions

- [x] **Step 1: Create FormulaAutocomplete component**

```tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';

interface Props {
  visible: boolean;
  editValue: string;
  onSelect: (functionName: string) => void;
  position: { top: number; left: number };
}

export function FormulaAutocomplete({ visible, editValue, onSelect, position }: Props) {
  const engine = useStore(s => s.engine);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const allFunctions = useMemo(() => engine?.getFunctionList() || [], [engine]);

  const filtered = useMemo(() => {
    // Extract the current function name being typed (after =)
    const match = editValue.match(/^=([A-Z_a-z][A-Z_a-z0-9]*?)$/i);
    if (!match) return [];
    const typed = match[1].toUpperCase();
    return allFunctions
      .filter(f => f.name.startsWith(typed) && f.name !== typed)
      .slice(0, 12);
  }, [editValue, allFunctions]);

  useEffect(() => { setSelectedIndex(0); }, [filtered.length]);

  useEffect(() => {
    if (!visible || filtered.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[selectedIndex].name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onSelect('');
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, filtered, selectedIndex, onSelect]);

  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden"
      style={{ top: position.top, left: position.left, width: 340, maxHeight: 280 }}
    >
      <div className="text-[10px] text-gray-400 px-3 py-1.5 border-b border-gray-100 bg-gray-50 uppercase tracking-wide font-medium">
        Functions
      </div>
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 240 }}>
        {filtered.map((fn, i) => (
          <div
            key={fn.name}
            className={`px-3 py-2 cursor-pointer flex items-start gap-3 text-sm transition-colors ${
              i === selectedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
            }`}
            onMouseDown={(e) => { e.preventDefault(); onSelect(fn.name); }}
            onMouseEnter={() => setSelectedIndex(i)}
          >
            <span className="font-mono font-semibold text-xs bg-blue-100/60 text-blue-600 px-1.5 py-0.5 rounded shrink-0">
              {fn.name}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] text-gray-500 truncate">{fn.description}</div>
              <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate">{fn.syntax}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

### Task 6: Integrate Autocomplete into SpreadsheetGrid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `FormulaAutocomplete` component, `editValue` from store
- Produces: Autocomplete popup appears when editing a cell that starts with `=`

- [x] **Step 1: Import and wire up FormulaAutocomplete**

At the top of `SpreadsheetGrid.tsx`, add import:
```typescript
import { FormulaAutocomplete } from './FormulaAutocomplete';
```

Add state for autocomplete position:
```typescript
const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
```

Add a ref for the editing input to measure position:
```typescript
const editContainerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Calculate popup position when editing starts**

In the `handleCellDoubleClick` callback and the keyboard handler that starts editing (around lines 86-92 and 145-152), after `setEditingCell(cellId)`, add position calculation:

```typescript
// After setEditingCell(cellId) in handleCellDoubleClick:
requestAnimationFrame(() => {
  if (editContainerRef.current) {
    const rect = editContainerRef.current.getBoundingClientRect();
    setAutocompletePos({ top: rect.bottom + 2, left: rect.left });
  }
});
```

Also add `ref={editContainerRef}` to the cell `<div>` that is being edited (the container around the input).

- [ ] **Step 3: Handle function selection from autocomplete**

Add a callback:
```typescript
const handleAutocompleteSelect = useCallback((functionName: string) => {
  if (!functionName) {
    // Dismissed — do nothing
    return;
  }
  setEditValue('=' + functionName + '(');
}, [setEditValue]);
```

- [ ] **Step 4: Render FormulaAutocomplete in the grid**

At the end of the component's return JSX (before the closing `</div>`), add:
```tsx
<FormulaAutocomplete
  visible={!!editingCell && editValue.startsWith('=')}
  editValue={editValue}
  onSelect={handleAutocompleteSelect}
  position={autocompletePos}
/>
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

### Task 7: Integrate Autocomplete into Toolbar Formula Bar

**Files:**
- Modify: `src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: Same `FormulaAutocomplete` component
- Produces: Autocomplete popup when typing `=` in the formula bar input

- [x] **Step 1: Import and wire up FormulaAutocomplete in Toolbar**

In `src/components/Toolbar.tsx`, add import:
```typescript
import { FormulaAutocomplete } from './FormulaAutocomplete';
```

Add state for autocomplete position and ref for the formula bar input:
```typescript
const [fbAutocompleteVisible, setFbAutocompleteVisible] = useState(false);
const [fbAutocompletePos, setFbAutocompletePos] = useState({ top: 0, left: 0 });
const formulaBarRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 2: Trigger autocomplete visibility on formula bar input**

On the formula bar `<input>` (around line 294), add `onFocus` and `onChange` handlers:
```tsx
onFocus={(e) => {
  if (e.currentTarget.value.startsWith('=')) {
    const rect = e.currentTarget.getBoundingClientRect();
    setFbAutocompletePos({ top: rect.bottom + 2, left: rect.left });
    setFbAutocompleteVisible(true);
  }
}}
onChange={(e) => {
  const val = e.target.value;
  setChatInput(val);
  if (val.startsWith('=')) {
    const rect = formulaBarRef.current?.getBoundingClientRect();
    if (rect) setFbAutocompletePos({ top: rect.bottom + 2, left: rect.left });
    setFbAutocompleteVisible(true);
  } else {
    setFbAutocompleteVisible(false);
  }
}}
onBlur={() => setTimeout(() => setFbAutocompleteVisible(false), 200)}
ref={formulaBarRef}
```

- [ ] **Step 3: Render autocomplete popup and handle selection**

Add at the end of the Toolbar return:
```tsx
<FormulaAutocomplete
  visible={fbAutocompleteVisible}
  editValue={chatInput}
  onSelect={(fn) => {
    if (fn) {
      const currentVal = chatInput;
      const newVal = currentVal.replace(/=[A-Za-z_]*$/, '=' + fn + '(');
      setChatInput(newVal);
    }
    setFbAutocompleteVisible(false);
  }}
  position={fbAutocompletePos}
/>
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

## Feature C: Pivot Tables

### Task 8: Pivot Table Types and Engine

**Files:**
- Modify: `src/types/index.ts` (add PivotConfig, PivotField types)
- Modify: `src/engine/spreadsheet.ts` (add pivot computation method)

**Interfaces:**
- Consumes: `SheetData` cells, existing cell utilities
- Produces: `PivotConfig` type, `computePivotTable(sourceCells, config): PivotResult`

- [x] **Step 1: Add pivot table types to index.ts**

In `src/types/index.ts`, add before the `SheetData` interface:

```typescript
export interface PivotField {
  sourceColumn: string; // Column letter, e.g., "A"
  aggregation: 'sum' | 'count' | 'average' | 'min' | 'max' | 'distinctCount';
  label?: string;
}

export interface PivotConfig {
  sourceSheetId: string;
  sourceRange: { startRow: number; endRow: number; startCol: number; endCol: number };
  rows: PivotField[];   // Fields to group by (row labels)
  columns: PivotField[]; // Fields to group by (column labels)
  values: PivotField[];  // Fields to aggregate
}

export interface PivotResult {
  headers: string[];
  rows: Array<(string | number)[]>;
  grandTotals: (string | number)[];
}
```

Also add to `SheetData` interface:
```typescript
pivotConfig?: PivotConfig;
pivotResult?: PivotResult;
```

- [ ] **Step 2: Add computePivotTable to SpreadsheetEngine**

In `src/engine/spreadsheet.ts`, add method to `SpreadsheetEngine` class:

```typescript
computePivotTable(
  cells: Record<string, { value: string | number | null }>,
  config: PivotConfig,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): PivotResult {
  // Read source data into rows
  const sourceRows: Record<string, (string | number | null)[]>[] = [];
  for (let r = startRow; r <= endRow; r++) {
    const row: Record<string, (string | number | null)[]> = {};
    for (let c = startCol; c <= endCol; c++) {
      const colLetter = colToLetter(c);
      const cellId = refToCell(r, c);
      row[colLetter] = [cells[cellId]?.value ?? null];
    }
    sourceRows.push(row);
  }

  // Build row keys from row fields
  const rowKeyMap = new Map<string, (string | number)[]>();
  const colKeyMap = new Map<string, (string | number)[]>();
  const valueAggMap = new Map<string, number[]>();

  for (const sourceRow of sourceRows) {
    const rowKeyParts = config.rows.map(f => String(sourceRow[f.sourceColumn]?.[0] ?? ''));
    const rowKey = rowKeyParts.join('||');
    if (!rowKeyMap.has(rowKey)) rowKeyMap.set(rowKey, rowKeyParts);

    const colKeyParts = config.columns.map(f => String(sourceRow[f.sourceColumn]?.[0] ?? ''));
    const colKey = colKeyParts.join('||');
    if (!colKeyMap.has(colKey)) colKeyMap.set(colKey, colKeyParts);

    const aggKey = `${rowKey}||${colKey}`;
    const existing = valueAggMap.get(aggKey) || [];

    for (const vf of config.values) {
      const rawVal = sourceRow[vf.sourceColumn]?.[0];
      const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
      if (!isNaN(numVal)) existing.push(numVal);
    }
    valueAggMap.set(aggKey, existing);
  }

  // Build result headers
  const rowFieldLabels = config.rows.map(f => f.label || f.sourceColumn);
  const colFieldLabels = config.columns.map(f => f.label || f.sourceColumn);
  const valueLabels = config.values.map(f => f.label || `${f.aggregation}(${f.sourceColumn})`);

  const colKeys = Array.from(colKeyMap.keys());
  const headers = [...rowFieldLabels, ...colKeys.flatMap(ck => {
    const parts = colKeyMap.get(ck)!;
    return valueLabels.map(vl => [...parts, vl].join(' '));
  })];

  // Build result rows
  const resultRows: (string | number)[][] = [];
  for (const [rowKey, rowParts] of rowKeyMap) {
    const row: (string | number)[] = [...rowParts];
    for (const colKey of colKeys) {
      const values = valueAggMap.get(`${rowKey}||${colKey}`) || [];
      for (const vf of config.values) {
        switch (vf.aggregation) {
          case 'sum': row.push(values.reduce((a, b) => a + b, 0)); break;
          case 'average': row.push(values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0); break;
          case 'count': row.push(values.length); break;
          case 'min': row.push(values.length ? Math.min(...values) : 0); break;
          case 'max': row.push(values.length ? Math.max(...values) : 0); break;
          case 'distinctCount': row.push(new Set(values).size); break;
        }
      }
    }
    resultRows.push(row);
  }

  return { headers, rows: resultRows, grandTotals: [] };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

### Task 9: Pivot Table Configuration Dialog

**Files:**
- Create: `src/components/PivotDialog.tsx`

**Interfaces:**
- Consumes: `PivotConfig`, `PivotField` types, `useStore` (getActiveSheet, selection, addSheet, setCellValue)
- Produces: A dialog where users drag fields into Row/Column/Value areas to configure a pivot table

- [x] **Step 1: Create PivotDialog component**

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

    const newSheet = useStore.getState().getActiveSheet();
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

---

### Task 10: Pivot Table Keyboard Shortcut and Toolbar Button

**Files:**
- Modify: `src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `showPivotDialog` state from store
- Produces: A toolbar button to create pivot tables

- [x] **Step 1: Add Pivot Table button to Toolbar**

In `src/components/Toolbar.tsx`, after the existing format/style buttons, add:

```tsx
<button
  onClick={() => useStore.getState().setShowPivotDialog(true)}
  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
  title="Create Pivot Table"
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
  <span className="hidden md:inline">Pivot</span>
</button>
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 14 tests pass

---

## Final Verification

### Task 11: Full Build and Test Verification

- [x] **Step 1: Run full test suite**

Run: `npm test`
Expected: All 14 tests pass (no regressions)

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No new errors (pre-existing errors in other files are acceptable)

- [ ] **Step 3: Run production build**

Run: `npx vite build`
Expected: Build succeeds, output ~1,600-1,800 kB

- [ ] **Step 4: Manual smoke test checklist**

1. Open app → select cells → right-click → "Data Validation" → configure number min/max → apply
2. Enter invalid value → red triangle indicator appears
3. Enter valid value → indicator disappears
4. Right-click → "Data Validation" → list dropdown → type in cells → dropdown arrow shows
5. Double-click cell → type `=` → autocomplete popup appears with function list
6. Use arrow keys to navigate → Tab to select → function name inserted
7. Right-click → "Pivot Table" → drag fields → generate → new sheet created with pivot data
8. Resize browser window → all new features work on mobile widths
9. All existing features still work (formatting, formulas, charts, undo/redo)
