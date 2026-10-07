import type { PivotConfig, PivotResult } from '@/types';
import { colToLetter, refToCell } from '@/lib/cellRef';

export interface PivotField {
  sourceColumn: string;
  aggregation: 'sum' | 'count' | 'average' | 'min' | 'max' | 'distinctCount';
  label?: string;
}

export function computePivotTable(
  cells: Record<string, { value: string | number | boolean | null }>,
  config: PivotConfig,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
): PivotResult {
  const dataStartRow = config.hasHeader ? startRow + 1 : startRow;
  const sourceRows: Record<string, (string | number | boolean | null)[]>[] = [];
  for (let r = dataStartRow; r <= endRow; r++) {
    const row: Record<string, (string | number | boolean | null)[]> = {};
    for (let c = startCol; c <= endCol; c++) {
      const colLetter = colToLetter(c);
      const cellId = refToCell(r, c);
      row[colLetter] = [cells[cellId]?.value ?? null];
    }
    sourceRows.push(row);
  }

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

    for (let vfIdx = 0; vfIdx < config.values.length; vfIdx++) {
      const vf = config.values[vfIdx];
      const vfKey = `${rowKey}||${colKey}||${vfIdx}`;
      const existing = valueAggMap.get(vfKey) || [];
      const rawVal = sourceRow[vf.sourceColumn]?.[0];
      const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
      if (!isNaN(numVal)) existing.push(numVal);
      valueAggMap.set(vfKey, existing);
    }
  }

  const rowFieldLabels = config.rows.map(f => f.label || f.sourceColumn);
  const valueLabels = config.values.map(f => f.label || `${f.aggregation}(${f.sourceColumn})`);

  const colKeys = Array.from(colKeyMap.keys());
  const headers = [...rowFieldLabels, ...colKeys.flatMap(ck => {
    const parts = colKeyMap.get(ck)!;
    return valueLabels.map(vl => [...parts, vl].join(' '));
  })];

  const resultRows: (string | number)[][] = [];
  for (const [rowKey, rowParts] of rowKeyMap) {
    const row: (string | number)[] = [...rowParts];
    for (const colKey of colKeys) {
      for (let vfIdx = 0; vfIdx < config.values.length; vfIdx++) {
        const values = valueAggMap.get(`${rowKey}||${colKey}||${vfIdx}`) || [];
        row.push(aggregate(config.values[vfIdx].aggregation, values));
      }
    }
    resultRows.push(row);
  }

  const grandTotals: (string | number)[] = [];
  if (config.rows.length > 0 && config.values.length > 0 && resultRows.length > 0) {
    grandTotals.push('Grand Total', ...config.rows.slice(1).map(() => ''));
    for (const colKey of colKeys) {
      for (let vfIdx = 0; vfIdx < config.values.length; vfIdx++) {
        // Aggregate the raw values so average/min/distinctCount stay correct.
        const all = Array.from(rowKeyMap.keys()).flatMap(rk => valueAggMap.get(`${rk}||${colKey}||${vfIdx}`) || []);
        grandTotals.push(aggregate(config.values[vfIdx].aggregation, all));
      }
    }
  }

  return { headers, rows: resultRows, grandTotals };
}

function aggregate(aggregation: PivotField['aggregation'], values: number[]): number {
  switch (aggregation) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'average': return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    case 'count': return values.length;
    case 'min': return values.length ? values.reduce((a, b) => Math.min(a, b)) : 0;
    case 'max': return values.length ? values.reduce((a, b) => Math.max(a, b)) : 0;
    case 'distinctCount': return new Set(values).size;
  }
}