import { useStore } from '@/store/useStore';
import { cellToRef, refToCell } from '@/engine/spreadsheet';
import { X, Move } from 'lucide-react';
import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { clampChartBox, getChartOverlayBounds, type ChartBounds } from '@/lib/chartLayout';
import type { ChartConfig, TrendLineConfig, AxisConfig } from '@/types';
import {
  computeTrendValues,
  formatTrendEquation,
} from '@/lib/chartMath';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const RANGE_PATTERN = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;

// ─── Shared Types ─────────────────────────────────────────────────────────────

interface SeriesData {
  label: string;
  values: number[];
  color: string;
}

interface MultiSeriesChartData {
  labels: string[];
  series: SeriesData[];
}

interface ChartProps {
  data: MultiSeriesChartData;
  maxVal: number;
  trendLine?: TrendLineConfig;
  axisConfig?: AxisConfig;
}

// ─── Data Parsing ─────────────────────────────────────────────────────────────

function parseRangeRef(range: string) {
  const match = range.match(RANGE_PATTERN);
  if (!match) return null;
  return {
    start: cellToRef(`${match[1]}${match[2]}`),
    end: cellToRef(`${match[3]}${match[4]}`),
  };
}

function readColumnValues(
  startRow: number,
  endRow: number,
  col: number,
  getComputedValue: (row: number, col: number) => string,
): number[] {
  const values: number[] = [];
  for (let r = startRow; r <= endRow; r++) {
    values.push(parseFloat(getComputedValue(r, col)) || 0);
  }
  return values;
}

function parseExplicitSeries(
  chart: ChartConfig,
  getComputedValue: (row: number, col: number) => string,
): MultiSeriesChartData | null {
  if (!chart.series?.length) return null;

  const colors = chart.colors || DEFAULT_COLORS;
  const ref = parseRangeRef(chart.dataRange);
  const labels: string[] = [];

  if (ref) {
    for (let r = ref.start.row; r <= ref.end.row; r++) {
      labels.push(getComputedValue(r, ref.start.col) || `Row ${r + 1}`);
    }
  }

  const series: SeriesData[] = chart.series.map((s, idx) => {
    const sRef = parseRangeRef(s.dataRange);
    const values = sRef
      ? readColumnValues(sRef.start.row, sRef.end.row, sRef.end.col, getComputedValue)
      : [];
    return { label: s.label, values, color: s.color || colors[idx % colors.length] };
  });

  return { labels, series };
}

function parseLegacyRange(
  chart: ChartConfig,
  cells: Record<string, { value: string | number | boolean | null; formula?: string }>,
  getComputedValue: (row: number, col: number) => string,
): MultiSeriesChartData {
  const colors = chart.colors || DEFAULT_COLORS;
  const ref = parseRangeRef(chart.dataRange);
  if (!ref) return { labels: [], series: [] };

  const { start, end } = ref;
  const numCols = end.col - start.col;

  // Read labels from first column
  const labels: string[] = [];
  for (let r = start.row; r <= end.row; r++) {
    const cellId = refToCell(r, start.col);
    const cellData = cells[cellId];
    labels.push(cellData?.value != null ? String(cellData.value) : getComputedValue(r, start.col) || `Row ${r + 1}`);
  }

  // Single value column
  if (numCols <= 1) {
    const values = readColumnValues(start.row, end.row, end.col, getComputedValue);
    return { labels, series: [{ label: 'Series 1', values, color: colors[0] }] };
  }

  // Multiple value columns → multiple series
  const series: SeriesData[] = [];
  for (let c = start.col + 1; c <= end.col; c++) {
    const values = readColumnValues(start.row, end.row, c, getComputedValue);
    const headerRow = start.row > 0 ? start.row - 1 : -1;
    const headerVal = headerRow >= 0 ? getComputedValue(headerRow, c) : '';
    const label = headerVal || `Series ${c - start.col}`;
    series.push({ label, values, color: colors[(c - start.col - 1) % colors.length] });
  }
  return { labels, series };
}

function parseMultiSeriesData(
  chart: ChartConfig,
  cells: Record<string, { value: string | number | boolean | null; formula?: string }>,
  getComputedValue: (row: number, col: number) => string,
): MultiSeriesChartData {
  return parseExplicitSeries(chart, getComputedValue) ?? parseLegacyRange(chart, cells, getComputedValue);
}

// ─── Chart Type Registry ──────────────────────────────────────────────────────

const CHART_COMPONENTS: Record<string, React.FC<ChartProps & { variant?: string }>> = {
  bar: (props) => <BarChart {...props} horizontal />,
  column: (props) => <BarChart {...props} horizontal={false} />,
  pie: ({ data }) => <PieChart data={data} />,
  line: (props) => <LineChart {...props} fill={false} scatter={false} />,
  area: (props) => <LineChart {...props} fill scatter={false} />,
  scatter: (props) => <LineChart {...props} fill={false} scatter />,
};

function renderChart(type: string, props: ChartProps): React.ReactNode {
  const Component = CHART_COMPONENTS[type];
  if (!Component) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chart type: {type}</div>;
  }
  return <Component {...props} />;
}

// ─── Overlay Entry Point ──────────────────────────────────────────────────────

export function ChartOverlay() {
  const { getActiveSheet, removeChart } = useStore();
  const sheet = getActiveSheet();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<ChartBounds>(() => getChartOverlayBounds());

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBounds({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheet.charts?.length]);

  if (!sheet.charts || sheet.charts.length === 0) return null;

  return (
    <div ref={wrapRef} className="absolute inset-0 z-20 overflow-hidden pointer-events-none">
      {sheet.charts.map((chart) => (
        <ChartCard key={chart.id} chart={chart} bounds={bounds} onRemove={() => removeChart(chart.id)} />
      ))}
    </div>
  );
}

// ─── ChartCard Component ──────────────────────────────────────────────────────

function ChartCard({ chart, onRemove, bounds }: { chart: ChartConfig; onRemove: () => void; bounds: ChartBounds }) {
  const { getActiveSheet, getComputedValue, updateChartPosition } = useStore();
  const sheet = getActiveSheet();
  const box = clampChartBox(
    { x: chart.position.x, y: chart.position.y, width: chart.position.width, height: chart.position.height },
    bounds,
  );
  const [pos, setPos] = useState({ x: box.x, y: box.y });
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef({ width: box.width, height: box.height });
  sizeRef.current = { width: box.width, height: box.height };

  useEffect(() => {
    if (isDraggingRef.current) return;
    const next = clampChartBox(
      { x: posRef.current.x, y: posRef.current.y, width: chart.position.width, height: chart.position.height },
      bounds,
    );
    setPos({ x: next.x, y: next.y });
    posRef.current = { x: next.x, y: next.y };
  }, [bounds.width, bounds.height, chart.position.width, chart.position.height]);

  const data = useMemo(
    () => parseMultiSeriesData(chart, sheet.cells, getComputedValue),
    [chart, sheet.cells, getComputedValue],
  );

  const maxVal = useMemo(
    () => Math.max(...data.series.flatMap((s) => s.values.map(Math.abs)), 1),
    [data],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    updateChartPosition(chart.id, posRef.current.x, posRef.current.y, sizeRef.current);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [chart.id, updateChartPosition]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) {
      endDrag(e);
      return;
    }
    const raw = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    };
    const clamped = clampChartBox(
      { ...raw, width: sizeRef.current.width, height: sizeRef.current.height },
      bounds,
    );
    const newPos = { x: clamped.x, y: clamped.y };
    setPos(newPos);
    posRef.current = newPos;
  }, [endDrag, bounds]);

  useEffect(() => () => {
    isDraggingRef.current = false;
  }, []);

  const chartProps: ChartProps = { data, maxVal, trendLine: chart.trendLine, axisConfig: chart.axisConfig };

  return (
    <div
      className="absolute bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-20"
      style={{ left: pos.x, top: pos.y, width: box.width, height: box.height, pointerEvents: 'none' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 cursor-move touch-none"
        style={{ pointerEvents: 'auto' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="flex items-center gap-1.5">
          <Move size={12} className="text-gray-400" />
          <span className="text-xs font-medium text-gray-700">{chart.title}</span>
        </div>
        <button className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg min-w-[36px] min-h-[36px] flex items-center justify-center" onClick={onRemove} aria-label="Remove chart">
          <X size={16} />
        </button>
      </div>
      <div className="p-3 flex-1" style={{ height: box.height - 40 }}>
        {renderChart(chart.type, chartProps)}
        {data.series.length > 1 && (
          <div className="flex flex-wrap gap-2 mt-1 justify-center">
            {data.series.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="text-[9px] text-gray-500">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bar/Column Chart ─────────────────────────────────────────────────────────

function BarChart({ data, maxVal, horizontal }: ChartProps & { horizontal: boolean }) {
  const seriesCount = data.series.length;

  if (horizontal) {
    return (
      <div className="flex flex-col gap-1 h-full justify-center overflow-y-auto">
        {data.labels.map((label, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-16 truncate text-right">{label}</span>
            <div className="flex-1 flex flex-col gap-0.5">
              {data.series.map((s, sIdx) => (
                <div key={sIdx} className="bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(Math.abs(s.values[rowIdx] || 0) / maxVal) * 100}%`, backgroundColor: s.color }}
                  />
                </div>
              ))}
            </div>
            <span className="text-[10px] text-gray-600 w-10">
              {data.series.map((s) => s.values[rowIdx]?.toLocaleString() || '0').join('/')}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Vertical column chart with grouped bars
  const groupWidth = 100 / data.labels.length;
  const barWidth = groupWidth / (seriesCount + 0.5);

  return (
    <div className="flex items-end justify-around h-full gap-0.5 pb-5 relative">
      <div className="absolute bottom-4 left-0 right-0 border-t border-gray-200" />
      {data.labels.map((label, rowIdx) => (
        <div key={rowIdx} className="flex items-end gap-px flex-1 justify-center" style={{ height: '100%' }}>
          {data.series.map((s, sIdx) => (
            <div key={sIdx} className="flex flex-col items-center gap-0.5 h-full justify-end">
              <span className="text-[8px] text-gray-400">{(s.values[rowIdx] || 0).toLocaleString()}</span>
              <div
                className="rounded-t transition-all duration-500"
                style={{
                  height: `${(Math.abs(s.values[rowIdx] || 0) / maxVal) * 80}%`,
                  width: Math.max(8, barWidth * 2),
                  backgroundColor: s.color,
                }}
              />
            </div>
          ))}
          <span className="absolute bottom-0 text-[8px] text-gray-500 truncate" style={{ width: `${groupWidth}%` }}>
            {label.slice(0, 6)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Pie Chart ────────────────────────────────────────────────────────────────

function PieChart({ data }: { data: MultiSeriesChartData }) {
  const series = data.series[0];
  if (!series) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>;
  const total = series.values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>;

  const colors = data.series.length > 1
    ? data.series.map((s) => s.color)
    : Array.from({ length: series.values.length }, (_, i) => DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

  let cumulativePercent = 0;
  const slices = series.values.map((val, i) => {
    const percent = (Math.abs(val) / total) * 100;
    const start = cumulativePercent;
    cumulativePercent += percent;
    return { start, percent, color: colors[i % colors.length], label: data.labels[i], value: val };
  });

  const gradient = slices.map((s) => `${s.color} ${s.start}% ${s.start + s.percent}%`).join(', ');

  return (
    <div className="flex items-center gap-3 h-full">
      <div className="w-32 h-32 rounded-full shrink-0 shadow-inner" style={{ background: `conic-gradient(${gradient})` }} />
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

// ─── Line/Area/Scatter Chart ──────────────────────────────────────────────────

const SVG_WIDTH = 300;
const SVG_HEIGHT = 180;
const SVG_PADDING = 30;

function LineChart({ data, maxVal, fill, trendLine, scatter, axisConfig }: ChartProps & { fill: boolean; scatter: boolean }) {
  const plotW = SVG_WIDTH - SVG_PADDING * 2;
  const plotH = SVG_HEIGHT - SVG_PADDING * 2;
  const numPoints = data.labels.length;

  const effectiveMin = axisConfig?.yMin ?? 0;
  const effectiveMax = axisConfig?.yMax ?? maxVal;
  const yRange = effectiveMax - effectiveMin || 1;
  const gridVisible = axisConfig?.showGrid !== false;

  const getPoints = (values: number[]) =>
    values.map((val, i) => ({
      x: SVG_PADDING + (i / Math.max(numPoints - 1, 1)) * plotW,
      y: SVG_PADDING + plotH - ((Math.abs(val) - effectiveMin) / yRange) * plotH,
    }));

  return (
    <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full h-full">
      <GridLines visible={gridVisible} plotH={plotH} plotW={plotW} />
      <AxisLabels axisConfig={axisConfig} plotW={plotW} plotH={plotH} svgHeight={SVG_HEIGHT} />

      {data.series.map((series, sIdx) => {
        const points = getPoints(series.values);
        return (
          <SeriesPath
            key={sIdx}
            points={points}
            color={series.color}
            fill={fill}
            scatter={scatter}
            seriesIndex={sIdx}
            plotH={plotH}
          />
        );
      })}

      {trendLine && data.series.map((series, sIdx) => (
        <TrendOverlay
          key={`trend-${sIdx}`}
          values={series.values}
          color={series.color}
          trendLine={trendLine}
          getPoints={getPoints}
          showEquation={sIdx === 0}
          plotH={plotH}
        />
      ))}

      {data.labels.slice(0, 8).map((label, i) => {
        const x = SVG_PADDING + (i / Math.max(numPoints - 1, 1)) * plotW;
        return (
          <text key={i} x={x} y={SVG_PADDING + plotH + 14} textAnchor="middle" fontSize={7} fill="#9CA3AF">
            {label.slice(0, 6)}
          </text>
        );
      })}
    </svg>
  );
}

// ─── SVG Sub-components ───────────────────────────────────────────────────────

function GridLines({ visible, plotH, plotW }: { visible: boolean; plotH: number; plotW: number }) {
  if (!visible) return null;
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line key={pct} x1={SVG_PADDING} y1={SVG_PADDING + plotH * (1 - pct)} x2={SVG_PADDING + plotW} y2={SVG_PADDING + plotH * (1 - pct)} stroke="#E5E7EB" strokeWidth={0.5} />
      ))}
    </>
  );
}

function AxisLabels({ axisConfig, plotW, plotH, svgHeight }: { axisConfig?: AxisConfig; plotW: number; plotH: number; svgHeight: number }) {
  return (
    <>
      {axisConfig?.yLabel && (
        <text x={8} y={SVG_PADDING + plotH / 2} textAnchor="middle" fontSize={7} fill="#6B7280" transform={`rotate(-90, 8, ${SVG_PADDING + plotH / 2})`}>
          {axisConfig.yLabel}
        </text>
      )}
      {axisConfig?.xLabel && (
        <text x={SVG_PADDING + plotW / 2} y={svgHeight - 4} textAnchor="middle" fontSize={7} fill="#6B7280">
          {axisConfig.xLabel}
        </text>
      )}
    </>
  );
}

interface Point { x: number; y: number }

function SeriesPath({ points, color, fill, scatter, seriesIndex, plotH }: {
  points: Point[];
  color: string;
  fill: boolean;
  scatter: boolean;
  seriesIndex: number;
  plotH: number;
}) {
  if (points.length === 0) return null;
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = pathD + ` L ${points[points.length - 1].x} ${SVG_PADDING + plotH} L ${SVG_PADDING} ${SVG_PADDING + plotH} Z`;

  return (
    <g>
      {fill && points.length > 1 && (
        <path d={areaD} fill={color} fillOpacity={0.1 + seriesIndex * 0.05} />
      )}
      {!scatter && points.length > 1 && (
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={scatter ? 4 : 3} fill={color} />
      ))}
    </g>
  );
}

function TrendOverlay({ values, color, trendLine, getPoints, showEquation, plotH: _plotH }: {
  values: number[];
  color: string;
  trendLine: TrendLineConfig;
  getPoints: (v: number[]) => Point[];
  showEquation: boolean;
  plotH: number;
}) {
  const trendValues = computeTrendValues(values, trendLine);
  const trendPoints = getPoints(trendValues);
  const trendPath = trendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const trendColor = trendLine.color || color;

  return (
    <g>
      <path d={trendPath} fill="none" stroke={trendColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
      {trendLine.showEquation && showEquation && (
        <text x={SVG_PADDING + 4} y={SVG_PADDING - 4} fontSize={7} fill={trendColor} opacity={0.8}>
          {formatTrendEquation(values, trendLine)}
        </text>
      )}
    </g>
  );
}
