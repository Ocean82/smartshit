import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { useMemo } from 'react';

export function StatusBar() {
  const { selection, getActiveSheet, getComputedValue } = useStore();
  const sheet = getActiveSheet();

  const stats = useMemo(() => {
    if (!selection) return null;

    const minR = Math.min(selection.startRow, selection.endRow);
    const maxR = Math.max(selection.startRow, selection.endRow);
    const minC = Math.min(selection.startCol, selection.endCol);
    const maxC = Math.max(selection.startCol, selection.endCol);

    const values: number[] = [];
    let count = 0;

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cellId = refToCell(r, c);
        const data = sheet.cells[cellId];
        if (data?.value != null || data?.formula) {
          count++;
          const computed = getComputedValue(r, c);
          const num = parseFloat(computed);
          if (!isNaN(num)) values.push(num);
        }
      }
    }

    if (values.length === 0) return { count, sum: null, avg: null, min: null, max: null };

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count,
      sum: Math.round(sum * 100) / 100,
      avg: Math.round((sum / values.length) * 100) / 100,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [selection, sheet.cells, getComputedValue]);

  const cellCount = Object.keys(sheet.cells).filter(k => sheet.cells[k]?.value != null).length;

  return (
    <div className="h-6 bg-gray-50 border-t border-gray-200 flex items-center px-3 text-[10px] text-gray-500 gap-4">
      <span>{sheet.name}</span>
      <span className="text-gray-300">|</span>
      <span>{cellCount} cells</span>

      {stats && stats.count > 0 && (
        <>
          <span className="text-gray-300">|</span>
          <span>Count: {stats.count}</span>
          {stats.sum !== null && (
            <>
              <span className="font-medium text-gray-600">Sum: {stats.sum.toLocaleString()}</span>
              <span>Avg: {stats.avg?.toLocaleString()}</span>
              <span>Min: {stats.min?.toLocaleString()}</span>
              <span>Max: {stats.max?.toLocaleString()}</span>
            </>
          )}
        </>
      )}

      <div className="flex-1" />
      <span className="text-gray-400">Vibe Excel v1.0</span>
    </div>
  );
}
