import React, { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import type { CellData } from '@/types';

interface GridCanvasProps {
  maxRows?: number;
  maxCols?: number;
  className?: string;
}

/** Extract numeric row index from a cell ref like "A1" -> 0 */
function rowFromRef(ref: string): number {
  const m = ref.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) - 1 : -1;
}

export function GridCanvas({ maxRows = 50, maxCols = 26, className }: GridCanvasProps) {
  const sheet = useStore((s) => {
    const wb = s.workbook;
    if (!wb) return undefined;
    return wb.sheets.find((sh) => sh.id === wb.activeSheetId) ?? wb.sheets[0];
  });

  const rowsByIndex = useMemo(() => {
    if (!sheet) return [];
    const map = new Map<number, Array<{ col: number; data: CellData }>>();
    for (const [ref, data] of Object.entries(sheet.cells)) {
      const col = ref.charCodeAt(0) - 65;
      if (col < 0 || col >= maxCols) continue;
      const row = rowFromRef(ref);
      if (row < 0 || row >= maxRows) continue;
      if (data.value == null || data.value === '') continue;
      const r = map.get(row);
      if (r) r.push({ col, data });
      else map.set(row, [{ col, data }]);
    }
    const sorted = [...map.entries()].sort(([a], [b]) => a - b);
    return sorted.map(([row, cells]) => ({ row, cells: cells.sort((a, b) => a.col - b.col) }));
  }, [sheet, maxRows, maxCols]);

  if (!sheet) {
    return <div className={className}>No sheet data</div>;
  }

  return (
    <div className={className}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border px-1 py-0.5 bg-muted text-muted-foreground w-8" />
            {Array.from({ length: maxCols }, (_, i) => (
              <th key={i} className="border px-1 py-0.5 bg-muted text-muted-foreground font-normal">
                {String.fromCharCode(65 + i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsByIndex.map(({ row, cells }) => (
            <tr key={row}>
              <td className="border px-1 py-0.5 bg-muted text-muted-foreground text-center">{row + 1}</td>
              {Array.from({ length: maxCols }, (_, c) => {
                const cell = cells.find((cl) => cl.col === c);
                return (
                  <td key={c} className="border px-1 py-0.5 truncate max-w-[120px]">
                    {cell?.data?.displayValue ?? cell?.data?.value ?? ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
