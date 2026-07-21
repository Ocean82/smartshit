import { useStore } from '@/store/useStore';
import { refToCell } from '@/engine/spreadsheet';
import { useMemo, useState, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';

const ZOOM_LEVELS = [50, 75, 85, 100, 125, 150, 175, 200];

export function StatusBar() {
  const { selection, getActiveSheet, getComputedValue, messages } = useStore();
  const sheet = getActiveSheet();
  const [zoom, setZoom] = useState(100);

  const handleZoomChange = useCallback((newZoom: number) => {
    const clamped = Math.max(50, Math.min(200, newZoom));
    setZoom(clamped);
    // Apply zoom to the spreadsheet grid container via CSS custom property
    const gridEl = document.querySelector('[data-spreadsheet-grid]') as HTMLElement | null;
    if (gridEl) {
      gridEl.style.setProperty('--grid-zoom', String(clamped / 100));
      gridEl.style.transform = `scale(${clamped / 100})`;
      gridEl.style.transformOrigin = 'top left';
      // Adjust the parent container to account for scaled size
      const parent = gridEl.parentElement;
      if (parent) {
        parent.style.overflow = 'auto';
      }
    }
  }, []);

  const zoomIn = useCallback(() => {
    const next = ZOOM_LEVELS.find((z) => z > zoom) ?? 200;
    handleZoomChange(next);
  }, [zoom, handleZoomChange]);

  const zoomOut = useCallback(() => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < zoom) ?? 50;
    handleZoomChange(prev);
  }, [zoom, handleZoomChange]);

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

  // Calculate response time from last user→assistant pair
  const responseTime = useMemo(() => {
    if (messages.length < 2) return null;
    // Find the last assistant message
    for (let i = messages.length - 1; i >= 1; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        // Find the preceding user message
        for (let j = i - 1; j >= 0; j--) {
          if (messages[j].role === 'user') {
            const diff = messages[i].timestamp - messages[j].timestamp;
            if (diff > 0 && diff < 120_000) {
              return diff < 1000
                ? `${diff}ms`
                : `${(diff / 1000).toFixed(1)}s`;
            }
            return null;
          }
        }
      }
    }
    return null;
  }, [messages]);

  const cellCount = Object.keys(sheet.cells).filter(k => sheet.cells[k]?.value != null).length;

  return (
    <div className="h-6 border-t flex items-center px-3 text-[10px] gap-3 shrink-0 hidden md:flex" style={{ background: 'var(--surface-secondary)', borderColor: 'var(--neutral-200)', color: 'var(--neutral-500)' }}>
      <span className="font-medium" style={{ color: 'var(--neutral-700)' }}>{sheet.name}</span>
      <span style={{ color: 'var(--neutral-300)' }}>·</span>
      <span>{cellCount} cells</span>

      {stats && stats.count > 0 && (
        <>
          <span className="text-slate-300" style={{ color: 'var(--neutral-300)' }}>·</span>
          <span>Count: {stats.count}</span>
          {stats.sum !== null && (
            <>
              <span className="font-medium" style={{ color: 'var(--neutral-700)' }}>Sum: {stats.sum.toLocaleString()}</span>
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

      {/* Zoom controls */}
      <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3 ml-1">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= 50}
          className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out"
        >
          <Minus size={11} />
        </button>
        <select
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className="text-[10px] bg-transparent border-none cursor-pointer text-slate-600 font-medium w-[42px] text-center appearance-none"
          title="Zoom level"
        >
          {ZOOM_LEVELS.map((z) => (
            <option key={z} value={z}>{z}%</option>
          ))}
        </select>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= 200}
          className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}
