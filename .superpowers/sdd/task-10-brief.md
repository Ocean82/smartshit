### Task 10: Add Pivot Table Button to Toolbar

**Files:**
- Modify: `src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `useStore` (showPivotDialog, setShowPivotDialog, selection)
- Produces: A "Pivot Table" button in the toolbar that opens the PivotDialog

- [ ] **Step 1: Add import**

At the top of `src/components/Toolbar.tsx`, add to the existing imports:
```typescript
import { useStore } from '@/store/useStore';
```

Note: `useStore` may already be imported. If not, add it. If already imported, add `showPivotDialog`/`setShowPivotDialog` to the existing destructuring.

- [ ] **Step 2: Add state from store**

Inside the `Toolbar` component, destructure the new state alongside existing store state:
```typescript
const showPivotDialog = useStore((s) => s.showPivotDialog);
const setShowPivotDialog = useStore((s) => s.setShowPivotDialog);
```

Or add to existing store destructuring.

- [ ] **Step 3: Add Pivot Table button**

After the last formatting button (the `</div>` closing the format buttons section) and before the formula bar, add a new button group:

```tsx
<div className="flex items-center gap-1 border-l border-gray-200 pl-2">
  <button
    onClick={() => setShowPivotDialog(true)}
    disabled={!selection}
    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    title="Create pivot table from selection"
  >
    <span className="text-sm">📊</span> Pivot
  </button>
</div>
```

Note: The `selection` variable should already be available from the existing store destructuring in Toolbar.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All 14 tests pass
