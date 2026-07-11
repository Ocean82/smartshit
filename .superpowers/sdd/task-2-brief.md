### Task 2: Number Format Rendering in Grid

**Files:**
- Modify: `src/components/SpreadsheetGrid.tsx`

**Interfaces:**
- Consumes: `formatCellValue()` from `src/lib/formatUtils.ts` (Task 1)
- Produces: Cells display formatted values

- [ ] **Step 1: Add import**

In `SpreadsheetGrid.tsx`, add:
```typescript
import { formatCellValue } from '@/lib/formatUtils';
```

- [ ] **Step 2: Update cell rendering**

Find the cell render section where the cell value is displayed. It currently shows something like `cellData?.displayValue ?? cellData?.value ?? ''`. Replace the display logic with:
```typescript
{formatCellValue(cellData?.displayValue ?? cellData?.value, cellData?.format?.numberFormat)}
```

Note: If `displayValue` is used for formula results, keep that logic and apply format to the final display.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: All 14 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SpreadsheetGrid.tsx
git commit -m "feat: render formatted numbers in grid cells"
```
