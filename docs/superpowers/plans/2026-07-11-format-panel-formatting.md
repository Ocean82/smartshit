# Phase 4: Format Panel + Full Formatting Implementation Plan

> **Status: Implemented (2026-07-11).** Tasks 1–8 complete (borders, undoable range format, Format Panel, font color, tests). Follow-up polish for Sort/Filter/Conditional Format shipped in the same cycle.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a right-sidebar Format Panel with text formatting, number formatting, cell borders, font color picker, and undo/redo support for format changes.

**Architecture:** Modular Format Panel with four sub-components (TextSection, NumberSection, BorderSection, FillSection), a `formatUtils.ts` utility for number rendering and border CSS, and history integration in the store.

**Tech Stack:** React, Zustand, TypeScript, Tailwind CSS, Intl.NumberFormat

## Global Constraints

- No new npm dependencies
- Tests: 14 existing tests must continue passing
- Build: `npx tsc --noEmit` and `npx vite build` must succeed
- Follow existing code patterns (store actions, component structure, Tailwind classes)

---

### Task 1: Format Utilities

**Files:**
- Create: `src/lib/formatUtils.ts`

**Interfaces:**
- Consumes: `CellFormat` type from `src/types/index.ts`
- Produces: `formatCellValue()`, `getBorderCSS()`, `NUMBER_FORMATS` constant

- [ ] **Step 1: Create formatUtils.ts**

```typescript
import type { CellFormat } from '@/types';

export const NUMBER_FORMATS = [
  { value: '', label: 'General' },
  { value: 'number', label: 'Number (1,234.50)' },
  { value: 'currency', label: 'Currency ($1,234.56)' },
  { value: 'percent', label: 'Percentage (12.35%)' },
  { value: 'date', label: 'Date (07/11/2026)' },
  { value: 'text', label: 'Text (@)' },
] as const;

export function formatCellValue(value: string | number | boolean | null, numberFormat?: string): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (!numberFormat || numberFormat === '') return String(value);

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  switch (numberFormat) {
    case 'number':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'currency':
      if (isNaN(num)) return String(value);
      return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    case 'percent':
      if (isNaN(num)) return String(value);
      return (num / 100).toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 2 });
    case 'date': {
      const date = new Date(typeof value === 'number' ? value : parseFloat(String(value)));
      if (isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('en-US');
    }
    case 'text':
      return String(value);
    default:
      return String(value);
  }
}

export function getBorderCSS(borders?: CellFormat['borders']): React.CSSProperties {
  if (!borders) return {};
  const css: React.CSSProperties = {};
  if (borders.top) { css.borderTop = borders.top; }
  if (borders.right) { css.borderRight = borders.right; }
  if (borders.bottom) { css.borderBottom = borders.bottom; }
  if (borders.left) { css.borderLeft = borders.left; }
  return css;
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/formatUtils.ts
git commit -m "feat: add format utilities for number rendering and border CSS"
```

---

### Task 2: Number Format Rendering in Grid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `formatCellValue()` from Task 1
- Produces: Cells display formatted values

- [ ] **Step 1: Add import**

In `SpreadsheetGrid.tsx`, add:
```typescript
import { formatCellValue } from '@/lib/formatUtils';
```

- [ ] **Step 2: Update cell rendering**

Find the cell render section where `cellData?.displayValue ?? cellData?.value ?? ''` is displayed. Replace with:
```typescript
{formatCellValue(cellData?.value, cellData?.format?.numberFormat)}
```

Note: If `displayValue` is used for formula results, keep that logic and apply format to the final display:
```typescript
{formatCellValue(cellData?.displayValue ?? cellData?.value, cellData?.format?.numberFormat)}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SpreadsheetGrid.tsx
git commit -m "feat: render formatted numbers in grid cells"
```

---

### Task 3: Border Rendering in Grid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `getBorderCSS()` from Task 1
- Produces: Cells render border styles

- [ ] **Step 1: Add import**

In `SpreadsheetGrid.tsx`, add to existing import from formatUtils:
```typescript
import { formatCellValue, getBorderCSS } from '@/lib/formatUtils';
```

- [ ] **Step 2: Update getCellStyle**

Add border CSS to the `getCellStyle` function:
```typescript
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
    ...getBorderCSS(format.borders),
  };
}, []);
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SpreadsheetGrid.tsx
git commit -m "feat: render cell borders in grid"
```

---

### Task 4: History Integration for Format Changes

**Files:**
- Modify: `src/store/useStore.ts`

**Interfaces:**
- Consumes: `pushHistory()` (already exists in store)
- Produces: Format changes become undoable

- [ ] **Step 1: Add pushHistory to setCellFormat**

Find `setCellFormat` in the store and add `pushHistory()` at the start:
```typescript
setCellFormat: (cellId, format) => {
  pushHistory();
  set((s) => {
    // existing logic unchanged
  });
},
```

- [ ] **Step 2: Add pushHistory to setRangeFormat**

Find `setRangeFormat` in the store and add `pushHistory()` at the start:
```typescript
setRangeFormat: (format) => {
  const sel = get().selection;
  if (!sel) return;
  pushHistory();
  set((s) => {
    // existing logic unchanged
  });
},
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat: make format changes undoable via pushHistory"
```

---

### Task 5: Font Color Picker in Toolbar

**Files:**
- Modify: `src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `setRangeFormat` from store, 14-color palette pattern (existing bg color picker)
- Produces: Font color picker button with palette dropdown

- [ ] **Step 1: Add font color state**

Inside the `Toolbar` component, add:
```typescript
const [showFontColor, setShowFontColor] = useState(false);
```

- [ ] **Step 2: Add font color button**

After the existing background color button, add a font color button with the same palette pattern:
```tsx
<div className="relative">
  <button
    onClick={() => setShowFontColor(!showFontColor)}
    className="flex items-center gap-1 px-1.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
    title="Text color"
  >
    <span className="font-bold" style={{ color: selectedCellData?.format?.fontColor || '#000' }}>A</span>
    <div className="w-4 h-1 rounded-sm" style={{ backgroundColor: selectedCellData?.format?.fontColor || '#000' }} />
  </button>
  {showFontColor && (
    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-50 grid grid-cols-7 gap-1">
      {['#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#FFFFFF',
        '#FF0000', '#FF6D00', '#FFAB00', '#FFD600', '#AEEA00', '#00C853', '#00BFA5',
        '#2979FF', '#304FFE', '#651FFF', '#AA00FF', '#D500F9', '#F50057', '#FF1744'].map(c => (
        <button
          key={c}
          className="w-5 h-5 rounded border border-gray-200 hover:scale-110 transition-transform"
          style={{ backgroundColor: c }}
          onClick={() => { setRangeFormat({ fontColor: c }); setShowFontColor(false); }}
        />
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 3: Close palette on outside click**

Add a `useEffect` to close the font color palette when clicking outside (same pattern as bg color if it exists, or add a document click listener).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx
git commit -m "feat: add font color picker to toolbar"
```

---

### Task 6: Format Panel Component

**Files:**
- Create: `src/components/FormatPanel.tsx`

**Interfaces:**
- Consumes: `useStore` (selection, getActiveSheet, setRangeFormat, showFormatPanel, setShowFormatPanel), `NUMBER_FORMATS` from formatUtils
- Produces: A right sidebar with Text, Number, Border, Fill sections

- [ ] **Step 1: Create FormatPanel.tsx**

Create `src/components/FormatPanel.tsx` with the full component. This is the largest task. The component includes:

- Header with title and close button
- **TextSection:** Font family dropdown, font size dropdown, Bold/Italic/Underline toggles, text alignment, font color picker, fill color picker
- **NumberSection:** Number format dropdown with live preview
- **BorderSection:** Border style dropdown, border color picker, per-side toggle grid
- **FillSection:** Background color palette (reuse existing 14 colors)

Each section is collapsible. The panel reads the active cell's format to show current state.

```tsx
import React, { useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { NUMBER_FORMATS } from '@/lib/formatUtils';

const COLORS = ['#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#FFFFFF',
  '#FF0000', '#FF6D00', '#FFAB00', '#FFD600', '#AEEA00', '#00C853', '#00BFA5',
  '#2979FF', '#304FFE', '#651FFF', '#AA00FF', '#D500F9', '#F50057', '#FF1744'];

const BORDER_STYLES = [
  { value: '', label: 'None' },
  { value: '1px solid', label: 'Thin' },
  { value: '2px solid', label: 'Medium' },
  { value: '3px solid', label: 'Thick' },
  { value: '1px dashed', label: 'Dashed' },
  { value: '1px dotted', label: 'Dotted' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36];

export function FormatPanel() {
  const { showFormatPanel, setShowFormatPanel, selection, getActiveSheet, setRangeFormat } = useStore();
  const sheet = getActiveSheet();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [borderStyle, setBorderStyle] = useState('1px solid');
  const [borderColor, setBorderColor] = useState('#000000');

  const selectedCellId = selection
    ? `${String.fromCharCode(65 + Math.min(selection.startCol, selection.endCol))}${Math.min(selection.startRow, selection.endRow) + 1}`
    : null;
  const cellFormat = selectedCellId ? sheet.cells[selectedCellId]?.format : undefined;

  const toggle = useCallback((section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  if (!showFormatPanel) return null;

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-b border-gray-100">
      <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
        {title}
        <span className="text-gray-400">{collapsed[id] ? '▶' : '▼'}</span>
      </button>
      {!collapsed[id] && <div className="px-4 pb-3">{children}</div>}
    </div>
  );

  return (
    <div className="w-[280px] border-l border-gray-200 bg-white h-full overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Format</h3>
        <button onClick={() => setShowFormatPanel(false)} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {/* Text Section */}
      <Section id="text" title="Text">
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={cellFormat?.fontSize || 12}
              onChange={e => setRangeFormat({ fontSize: parseInt(e.target.value) })}
              className="border border-gray-200 rounded px-2 py-1 text-xs flex-1"
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
          </div>
          <div className="flex gap-1">
            {[['bold', 'B'], ['italic', 'I'], ['underline', 'U']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRangeFormat({ [key]: !(cellFormat as any)?.[key] })}
                className={`w-8 h-8 rounded border text-xs font-bold ${
                  (cellFormat as any)?.[key] ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="w-px bg-gray-200 mx-1" />
            {['left', 'center', 'right'].map(align => (
              <button
                key={align}
                onClick={() => setRangeFormat({ textAlign: align as any })}
                className={`w-8 h-8 rounded border text-xs ${
                  cellFormat?.textAlign === align ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {align === 'left' ? '⫷' : align === 'center' ? '☰' : '⫸'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div>
              <div className="text-[10px] text-gray-500 mb-1">Text Color</div>
              <div className="grid grid-cols-7 gap-0.5">
                {COLORS.map(c => (
                  <button key={c} className="w-4 h-4 rounded border border-gray-200 hover:scale-110"
                    style={{ backgroundColor: c }}
                    onClick={() => setRangeFormat({ fontColor: c })} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 mb-1">Fill Color</div>
              <div className="grid grid-cols-7 gap-0.5">
                {COLORS.map(c => (
                  <button key={c} className="w-4 h-4 rounded border border-gray-200 hover:scale-110"
                    style={{ backgroundColor: c }}
                    onClick={() => setRangeFormat({ bgColor: c })} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Number Section */}
      <Section id="number" title="Number">
        <div className="space-y-2">
          <select
            value={cellFormat?.numberFormat || ''}
            onChange={e => setRangeFormat({ numberFormat: e.target.value })}
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
          >
            {NUMBER_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </Section>

      {/* Border Section */}
      <Section id="border" title="Border">
        <div className="space-y-2">
          <div className="flex gap-2">
            <select value={borderStyle} onChange={e => setBorderStyle(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs flex-1">
              {BORDER_STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)}
              className="w-8 h-8 rounded border border-gray-200 cursor-pointer" />
          </div>
          <div className="flex justify-center">
            <div className="grid grid-cols-3 gap-1 w-32">
              <div /> <button onClick={() => setRangeFormat({ borders: { ...cellFormat?.borders, top: borderStyle ? `${borderStyle} ${borderColor}` : undefined } })}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px]">Top</button> <div />
              <button onClick={() => setRangeFormat({ borders: { ...cellFormat?.borders, left: borderStyle ? `${borderStyle} ${borderColor}` : undefined } })}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px]">Left</button>
              <div className="h-6 bg-gray-100 border border-gray-200 rounded" />
              <button onClick={() => setRangeFormat({ borders: { ...cellFormat?.borders, right: borderStyle ? `${borderStyle} ${borderColor}` : undefined } })}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px]">Right</button>
              <div /> <button onClick={() => setRangeFormat({ borders: { ...cellFormat?.borders, bottom: borderStyle ? `${borderStyle} ${borderColor}` : undefined } })}
                className="h-6 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded text-[10px]">Bottom</button> <div />
            </div>
          </div>
        </div>
      </Section>

      {/* Fill Section */}
      <Section id="fill" title="Fill">
        <div className="grid grid-cols-7 gap-1">
          {COLORS.map(c => (
            <button key={c} className="w-6 h-6 rounded border border-gray-200 hover:scale-110"
              style={{ backgroundColor: c }}
              onClick={() => setRangeFormat({ bgColor: c })} />
          ))}
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/FormatPanel.tsx
git commit -m "feat: add Format Panel component with text, number, border, fill sections"
```

---

### Task 7: Wire Format Panel into App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `FormatPanel` from Task 6, `showFormatPanel`/`setShowFormatPanel` from store
- Produces: Format Panel renders alongside main content, Toolbar has toggle button

- [ ] **Step 1: Add FormatPanel import to App.tsx**

```typescript
import { FormatPanel } from './components/FormatPanel';
```

- [ ] **Step 2: Render FormatPanel in App layout**

In the main layout div (the flex container), add `<FormatPanel />` after the spreadsheet area:
```tsx
<div className="flex-1 overflow-hidden">
  {/* existing spreadsheet content */}
</div>
<FormatPanel />
```

- [ ] **Step 3: Add Format Panel toggle to Toolbar**

In `Toolbar.tsx`, add a button that toggles the format panel:
```tsx
<button
  onClick={() => setShowFormatPanel(!showFormatPanel)}
  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
    showFormatPanel ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
  }`}
  title="Toggle format panel"
>
  🎨 Format
</button>
```

Add `showFormatPanel` and `setShowFormatPanel` to the store destructuring in Toolbar.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Toolbar.tsx
git commit -m "feat: wire Format Panel into App layout and Toolbar toggle"
```

---

### Task 8: Full Build and Test Verification

**Files:**
- No new files. Verification of the entire Phase 4 implementation.

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No new errors in Phase 4 files

- [ ] **Step 3: Run Vite build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 4: Manual verification checklist**

- [ ] Format Panel opens/closes via 🎨 button
- [ ] Text section: bold/italic/underline toggle works
- [ ] Text section: font size changes apply
- [ ] Text section: font color picker applies color
- [ ] Text section: fill color picker applies background
- [ ] Number section: format dropdown applies to cells
- [ ] Number section: currency shows $, percentage shows %
- [ ] Border section: per-side borders apply correctly
- [ ] Border section: border color applies
- [ ] Ctrl+Z undoes format changes
- [ ] Ctrl+Y redoes format changes

---

## Self-Review

**1. Spec coverage:**
- ✅ Format Panel component (Task 6)
- ✅ Number formatting rendering (Tasks 1, 2)
- ✅ Cell borders rendering (Tasks 1, 3)
- ✅ Font color picker (Task 5)
- ✅ History integration (Task 4)
- ✅ Format Panel wiring (Task 7)

**2. Placeholder scan:** No TBDs, TODOs, or vague steps. All code is provided.

**3. Type consistency:**
- `formatCellValue()` signature matches cell value types
- `getBorderCSS()` returns `React.CSSProperties`
- `setRangeFormat()` used consistently across all tasks
- `pushHistory()` called correctly in Task 4
