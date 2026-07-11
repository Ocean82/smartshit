### Task 7: Integrate Autocomplete into Toolbar Formula Bar

**Files:**
- Modify: `src/components/Toolbar.tsx`

**Interfaces:**
- Consumes: `FormulaAutocomplete` component (from Task 5)
- Produces: Autocomplete popup when typing `=` in the formula bar input

- [ ] **Step 1: Import and wire up FormulaAutocomplete in Toolbar**

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

On the formula bar `<input>` (the one with placeholder "Enter a value or formula..."), add `onFocus`, `onChange`, and `onBlur` handlers:

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

Note: `setChatInput` is already available in the Toolbar component — it's used by the existing `onChange` handler on the formula bar input. You'll need to replace or augment the existing `onChange` handler.

- [ ] **Step 3: Render autocomplete popup and handle selection**

At the end of the Toolbar return (before the closing `</div>`), add:
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
