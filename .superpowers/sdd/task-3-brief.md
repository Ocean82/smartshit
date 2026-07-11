### Task 3: Visual Validation Indicators in Grid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `CellData.validation`, `CellData.validationError` from types
- Produces: Red triangle indicator on cells with validation errors, dropdown arrow on list-validated cells, native `<select>` for editing list-validated cells

- [ ] **Step 1: Add validation indicators to cell rendering**

In `SpreadsheetGrid.tsx`, inside the cell `<div>` rendering (around line 422-471 in the current file), after the display value `<div>` and before the active cell handle `<div>` (the one with `w-2 h-2 bg-blue-500`), add:

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

In the editing section of the cell rendering (the `{isEditing ? (...) : (...)}` block), when `cellData?.validation?.type === 'list'`, replace the `<input>` with a `<select>`:

The current editing section looks like:
```tsx
{isEditing ? (
  <input ... />
) : (
  <div>...</div>
)}
```

Change it to:
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
) : (
  <div>...</div>
)}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass
