import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { useMemo, useEffect, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import { Minus, Plus } from 'lucide-react';

const ZOOM_LEVELS = [50, 75, 85, 100, 125, 150, 175, 200];

export function StatusBar() {
  const { selection, getActiveSheet, getComputedValue, messages, gridZoom, setGridZoom } = useStore();
  const sheet = getActiveSheet();

  // Apply zoom as a CSS custom property on the grid container.
  // The grid reads --grid-zoom and scales its font/cell sizes accordingly.
  // This avoids transform: scale() which breaks virtual scroll geometry.
  useEffect(() => {
    const gridEl = document.querySelector('[data-spreadsheet-grid]') as HTMLElement | null;
    if (gridEl) {
      gridEl.style.setProperty('--grid-zoom', String(gridZoom / 100));
      // Reset any legacy transform that may have been applied previously
      gridEl.style.transform = '';
      gridEl.style.transformOrigin = '';
    }
  }, [gridZoom]);

  const zoomIn = useCallback(() => {
    const next = ZOOM_LEVELS.find((z) => z > gridZoom) ?? 200;
    setGridZoom(next);
  }, [gridZoom, setGridZoom]);

  const zoomOut = useCallback(() => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < gridZoom) ?? 50;
    setGridZoom(prev);
  }, [gridZoom, setGridZoom]);

  const handleZoomSelect = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setGridZoom(Number(e.target.value));
  }, [setGridZoom]);

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

  const responseTime = useMemo(() => {
    if (messages.length < 2) return null;
    for (let i = messages.length - 1; i >= 1; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'user') {
            const diff = messages[i].timestamp - messages[j].timestamp;
            if (diff > 0 && diff < 120_000) {
              return diff < 1000 ? `${diff}ms` : `${(diff / 1000).toFixed(1)}s`;
            }
            return null;
          }
        }
      }
    }
    return null;
  }, [messages]);

  const cellCount = Object.keys(sheet.cells).filter((k) => sheet.cells[k]?.value != null).length;

  return (
    <div
      className="h-6 border-t flex items-center px-3 text-[10px] gap-3 shrink-0 hidden md:flex"
      style={{ background: 'var(--surface-secondary)', borderColor: 'var(--neutral-200)', color: 'var(--neutral-500)' }}
    >
      <span className="font-medium" style={{ color: 'var(--neutral-700)' }}>{sheet.name}</span>
      <span style={{ color: 'var(--neutral-300)' }}>·</span>
      <span>{cellCount} cells</span>

      {stats && stats.count > 0 && (
        <>
          <span style={{ color: 'var(--neutral-300)' }}>·</span>
          <span>Count: {stats.count}</span>
          {stats.sum !== null && (
            <>
              <span className="font-medium" style={{ color: 'var(--neutral-700)' }}>
                Sum: {stats.sum.toLocaleString()}
              </span>
              <span>Avg: {stats.avg?.toLocaleString()}</span>
              <span>Min: {stats.min?.toLocaleString()}</span>
              <span>Max: {stats.max?.toLocaleString()}</span>
            </>
          )}
        </>
      )}

      <div className="flex-1" />

      {responseTime && (
        <span title="Last AI response time" style={{ color: 'var(--neutral-400)' }}>
          ⚡ {responseTime}
        </span>
      )}

      {/* Zoom controls — state lives in the store, applied via CSS custom property */}
      <div className="flex items-center gap-1.5 border-l pl-3 ml-1" style={{ borderColor: 'var(--neutral-200)' }}>
        <button
          type="button"
          onClick={zoomOut}
          disabled={gridZoom <= 50}
          className="p-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--neutral-500)' }}
          title="Zoom out"
        >
          <Minus size={11} />
        </button>
        <select
          value={gridZoom}
          onChange={handleZoomSelect}
          className="text-[10px] bg-transparent border-none cursor-pointer font-medium w-[42px] text-center appearance-none"
          style={{ color: 'var(--neutral-600)' }}
          title="Zoom level"
        >
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>{z}%</option>
          ))}
        </select>
        <button
          type="button"
          onClick={zoomIn}
          disabled={gridZoom >= 200}
          className="p-0.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ color: 'var(--neutral-500)' }}
          title="Zoom in"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}
