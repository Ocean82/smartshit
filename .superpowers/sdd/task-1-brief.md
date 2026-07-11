### Task 1: Format Utilities

**Files:**
- Create: `src/lib/formatUtils.ts`

**Interfaces:**
- Consumes: `CellFormat` type from `src/types/index.ts`
- Produces: `formatCellValue()`, `getBorderCSS()`, `NUMBER_FORMATS` constant

- [ ] **Step 1: Create formatUtils.ts**

Create `src/lib/formatUtils.ts` with the following content:

```typescript
import React from 'react';
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
