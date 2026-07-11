### Task 8: Pivot Table Types and Engine

**Files:**
- Modify: `src/types/index.ts` (add PivotConfig, PivotField, PivotResult types)
- Modify: `src/engine/spreadsheet.ts` (add computePivotTable method)

**Interfaces:**
- Consumes: `SheetData` cells, existing cell utilities (`colToLetter`, `refToCell`)
- Produces: `PivotField`, `PivotConfig`, `PivotResult` types, `computePivotTable()` method on SpreadsheetEngine

- [ ] **Step 1: Add pivot table types to index.ts**

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
