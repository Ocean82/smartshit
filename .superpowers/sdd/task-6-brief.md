### Task 6: Integrate Autocomplete into SpreadsheetGrid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `FormulaAutocomplete` component (from Task 5), `editValue` from store
- Produces: Autocomplete popup appears when editing a cell that starts with `=`

- [ ] **Step 1: Import and wire up FormulaAutocomplete**

At the top of `SpreadsheetGrid.tsx`, add import:
```typescript
import { FormulaAutocomplete } from './FormulaAutocomplete';
```

Add state for autocomplete position:
```typescript
const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });
```

Add a ref for measuring position:
```typescript
const editContainerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Calculate popup position when editing starts**

In the `handleCellDoubleClick` callback (around line 86-92) and the keyboard handler that starts editing (around lines 145-152 in the current file), after `setEditingCell(cellId)`, add position calculation:

```typescript
requestAnimationFrame(() => {
  if (editContainerRef.current) {
    const rect = editContainerRef.current.getBoundingClientRect();
    setAutocompletePos({ top: rect.bottom + 2, left: rect.left });
  }
});
```

Also add `ref={editContainerRef}` to the cell `<div>` that wraps the editing input. The editing input is inside a `<div>` that has `key={col}` and the editing conditional. Find the outermost `<div>` for the cell being edited and add the ref there.

- [ ] **Step 3: Handle function selection from autocomplete**

Add a callback:
```typescript
const handleAutocompleteSelect = useCallback((functionName: string) => {
  if (!functionName) return; // Dismissed
  setEditValue('=' + functionName + '(');
}, [setEditValue]);
```

- [ ] **Step 4: Render FormulaAutocomplete in the grid**

At the end of the component's return JSX (before the final closing `</div>`), add:
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
