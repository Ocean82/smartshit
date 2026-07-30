import React, { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import type { CellData } from '@/types';

interface GridCanvasProps {
  maxRows?: number;
  maxCols?: number;
  className?: string;
}

export function GridCanvas({ maxRows = 50, maxCols = 26, className }: GridCanvasProps) {
  const sheet = useStore((s) => s.workbook?.sheets[s.activeSheetId ?? 0]);

  const visibleCells = useMemo(() => {
    if (!sheet) return [];
    const rows: Array<{ row: number; cells: Array<{ col: number; id: string; data?: CellData }> }> = [];
    for (let r = 0; r < Math.min(sheet.cells.length ?? 0, maxRows); r++) {
      const rowCells: Array<{ col: number; id: string; data?: CellData }> = [];
      for (let c = 0; c < maxCols; c++) {
        const id = refToCell(r, c);
        const data = sheet.cells[id];
        if (data && data.value != null && data.value !== '') {
          rowCells.push({ col: c, id, data });
        }
      }
      if (rowCells.length > 0) {
        rows.push({ row: r, cells: rowCells });
      }
    }
    return rows;
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
          {visibleCells.map(({ row, cells }) => (
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
