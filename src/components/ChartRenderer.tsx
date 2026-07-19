import { useStore } from '@/store/useStore';
import { cellToRef, refToCell } from '@/engine/spreadsheet';
import { X, Move } from 'lucide-react';
import { useState, useCallback } from 'react';
import type { ChartConfig } from '@/types';

export function ChartOverlay() {
  const { getActiveSheet, removeChart } = useStore();
  const sheet = getActiveSheet();

  if (!sheet.charts || sheet.charts.length === 0) return null;

  return (
    <>
      {sheet.charts.map((chart) => (
        <ChartCard key={chart.id} chart={chart} onRemove={() => removeChart(chart.id)} />
      ))}
    </>
  );
}

function ChartCard({ chart, onRemove }: { chart: ChartConfig; onRemove: () => void }) {
  const { getActiveSheet, getComputedValue, updateChartPosition } = useStore();
  const sheet = getActiveSheet();
  const [pos, setPos] = useState({ x: chart.position.x, y: chart.position.y });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Parse data range
  const data = parseChartData(chart, sheet.cells, getComputedValue);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  }, [pos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      updateChartPosition(chart.id, pos.x, pos.y);
    }
    setIsDragging(false);
  }, [isDragging, pos, chart.id, updateChartPosition]);

  const maxVal = Math.max(...data.values.map(Math.abs), 1);

  return (
    <div
      className="absolute bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-30"
      style={{
        left: pos.x,
        top: pos.y,
        width: chart.position.width,
        height: chart.position.height,
        pointerEvents: 'none',
      }}
    >
      {/* Chart header — interactive for drag and close */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-move"
        style={{ pointerEvents: 'auto' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="flex items-center gap-1.5">
          <Move size={12} className="text-gray-400" />
          <span className="text-xs font-medium text-gray-700">{chart.title}</span>
        </div>
        <button
          className="p-0.5 text-gray-400 hover:text-red-500 rounded"
          onClick={onRemove}
        >
          <X size={14} />
        </button>
      </div>

      {/* Chart body — pointer-events: none inherited, users can click through to grid */}
      <div className="p-3 flex-1" style={{ height: chart.position.height - 40 }}>
        {chart.type === 'bar' || chart.type === 'column' ? (
          <BarChart data={data} colors={chart.colors || []} maxVal={maxVal} horizontal={chart.type === 'bar'} />
        ) : chart.type === 'pie' ? (
          <PieChart data={data} colors={chart.colors || []} />
        ) : chart.type === 'line' || chart.type === 'area' ? (
          <LineChart data={data} colors={chart.colors || []} maxVal={maxVal} fill={chart.type === 'area'} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Chart type: {chart.type}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChartData {
  labels: string[];
  values: number[];
}

function parseChartData(
  chart: ChartConfig,
  cells: Record<string, { value: string | number | boolean | null; formula?: string }>,
  getComputedValue: (row: number, col: number) => string
): ChartData {
  const match = chart.dataRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return { labels: [], values: [] };

  const startRef = cellToRef(`${match[1]}${match[2]}`);
  const endRef = cellToRef(`${match[3]}${match[4]}`);

  const labels: string[] = [];
  const values: number[] = [];

  for (let r = startRef.row; r <= endRef.row; r++) {
    const labelCellId = refToCell(r, startRef.col);
    const labelData = cells[labelCellId];
    const label = labelData?.value != null ? String(labelData.value) : getComputedValue(r, startRef.col) || `Row ${r + 1}`;
    labels.push(label);

    const valStr = getComputedValue(r, endRef.col);
    const val = parseFloat(valStr) || 0;
    values.push(val);
  }

  return { labels, values };
}

function BarChart({ data, colors, maxVal, horizontal }: { data: ChartData; colors: string[]; maxVal: number; horizontal: boolean }) {
  if (horizontal) {
    return (
      <div className="flex flex-col gap-1.5 h-full justify-center">
        {data.values.map((val, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-16 truncate text-right">{data.labels[i]}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(Math.abs(val) / maxVal) * 100}%`,
                  backgroundColor: colors[i % colors.length],
                }}
              />
            </div>
            <span className="text-[10px] text-gray-600 w-10">{val.toLocaleString()}</span>
          </div>
        ))}
      </div>
    );
  }

  const barWidth = Math.min(40, (100 / data.values.length) - 2);
  return (
    <div className="flex items-end justify-around h-full gap-1 pb-5 relative">
      <div className="absolute bottom-4 left-0 right-0 border-t border-gray-200" />
      {data.values.map((val, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-[9px] text-gray-500">{val.toLocaleString()}</span>
          <div
            className="rounded-t transition-all duration-500"
            style={{
              height: `${(Math.abs(val) / maxVal) * 80}%`,
              width: `${barWidth}%`,
              minWidth: 12,
              backgroundColor: colors[i % colors.length],
            }}
          />
          <span className="text-[9px] text-gray-500 truncate max-w-full">{data.labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function PieChart({ data, colors }: { data: ChartData; colors: string[] }) {
  const total = data.values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>;

  let cumulativePercent = 0;
  const slices = data.values.map((val, i) => {
    const percent = (Math.abs(val) / total) * 100;
    const start = cumulativePercent;
    cumulativePercent += percent;
    return { start, percent, color: colors[i % colors.length], label: data.labels[i], value: val };
  });

  // Build conic gradient
  const gradient = slices
    .map((s) => `${s.color} ${s.start}% ${s.start + s.percent}%`)
    .join(', ');

  return (
    <div className="flex items-center gap-3 h-full">
      <div
        className="w-32 h-32 rounded-full shrink-0 shadow-inner"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div className="flex flex-col gap-1 overflow-y-auto">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-gray-600 truncate">{s.label}</span>
            <span className="text-[10px] text-gray-400">{s.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, colors, maxVal, fill }: { data: ChartData; colors: string[]; maxVal: number; fill: boolean }) {
  const w = 300;
  const h = 180;
  const padding = 30;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;

  const points = data.values.map((val, i) => ({
    x: padding + (i / Math.max(data.values.length - 1, 1)) * plotW,
    y: padding + plotH - (Math.abs(val) / maxVal) * plotH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1]?.x || 0} ${padding + plotH} L ${padding} ${padding + plotH} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={padding}
          y1={padding + plotH * (1 - pct)}
          x2={padding + plotW}
          y2={padding + plotH * (1 - pct)}
          stroke="#E5E7EB"
          strokeWidth={0.5}
        />
      ))}
      {/* Area fill */}
      {fill && points.length > 1 && (
        <path d={areaD} fill={colors[0]} fillOpacity={0.15} />
      )}
      {/* Line */}
      {points.length > 1 && (
        <path d={pathD} fill="none" stroke={colors[0]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={colors[0]} />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={8} fill="#6B7280">
            {data.values[i].toLocaleString()}
          </text>
          <text x={p.x} y={padding + plotH + 14} textAnchor="middle" fontSize={7} fill="#9CA3AF">
            {data.labels[i]?.slice(0, 6)}
          </text>
        </g>
      ))}
    </svg>
  );
}
