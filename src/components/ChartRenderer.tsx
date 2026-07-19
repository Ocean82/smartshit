import { useStore } from '@/store/useStore';
import { cellToRef, refToCell } from '@/engine/spreadsheet';
import { X, Move } from 'lucide-react';
import { useState, useCallback, useRef, useMemo } from 'react';
import type { ChartConfig, TrendLineConfig, AxisConfig } from '@/types';

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

interface SeriesData {
  label: string;
  values: number[];
  color: string;
}

interface MultiSeriesChartData {
  labels: string[];
  series: SeriesData[];
}

// --- Trend Line Computations ---

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function computeTrendValues(values: number[], config: TrendLineConfig): number[] {
  const n = values.length;
  if (n < 2) return values;

  switch (config.type) {
    case 'linear': {
      const { slope, intercept } = linearRegression(values);
      return values.map((_, i) => slope * i + intercept);
    }
    case 'movingAverage': {
      const period = config.period || 3;
      return values.map((_, i) => {
        const start = Math.max(0, i - period + 1);
        const window = values.slice(start, i + 1);
        return window.reduce((a, b) => a + b, 0) / window.length;
      });
    }
    case 'exponential': {
      // ln(y) = a + bx → y = e^(a+bx)
      const logValues = values.map((v) => (v > 0 ? Math.log(v) : 0));
      const { slope, intercept } = linearRegression(logValues);
      return values.map((_, i) => Math.exp(intercept + slope * i));
    }
    case 'polynomial': {
      const degree = Math.min(config.degree || 2, 4);
      const coeffs = polyFit(values, degree);
      return values.map((_, i) => {
        let y = 0;
        for (let d = 0; d <= degree; d++) y += coeffs[d] * Math.pow(i, d);
        return y;
      });
    }
    default:
      return values;
  }
}

/** Simple least-squares polynomial fit (degree 2–4). Returns coefficients [a0, a1, ..., an]. */
function polyFit(values: number[], degree: number): number[] {
  const n = values.length;
  const size = degree + 1;
  // Build normal equations: X^T * X * a = X^T * y
  const matrix: number[][] = Array.from({ length: size }, () => Array(size + 1).fill(0));
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      for (let i = 0; i < n; i++) {
        matrix[row][col] += Math.pow(i, row + col);
      }
    }
    for (let i = 0; i < n; i++) {
      matrix[row][size] += values[i] * Math.pow(i, row);
    }
  }
  // Gaussian elimination
  for (let col = 0; col < size; col++) {
    let maxRow = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[maxRow][col])) maxRow = row;
    }
    [matrix[col], matrix[maxRow]] = [matrix[maxRow], matrix[col]];
    const pivot = matrix[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let j = col; j <= size; j++) matrix[col][j] /= pivot;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let j = col; j <= size; j++) matrix[row][j] -= factor * matrix[col][j];
    }
  }
  return matrix.map((row) => row[size]);
}

function formatEquation(values: number[], config: TrendLineConfig): string {
  if (config.type === 'linear') {
    const { slope, intercept } = linearRegression(values);
    const sign = intercept >= 0 ? '+' : '-';
    return `y = ${slope.toFixed(2)}x ${sign} ${Math.abs(intercept).toFixed(2)}`;
  }
  if (config.type === 'movingAverage') return `MA(${config.period || 3})`;
  if (config.type === 'exponential') return 'y = ae^(bx)';
  return `poly(${config.degree || 2})`;
}

// --- Data Parsing ---

function parseMultiSeriesData(
  chart: ChartConfig,
  cells: Record<string, { value: string | number | boolean | null; formula?: string }>,
  getComputedValue: (row: number, col: number) => string,
): MultiSeriesChartData {
  const defaultColors = chart.colors || ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  // If explicit series definitions exist, use them
  if (chart.series && chart.series.length > 0) {
    // Parse label column from main dataRange first column
    const mainMatch = chart.dataRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    const labels: string[] = [];
    if (mainMatch) {
      const startRef = cellToRef(`${mainMatch[1]}${mainMatch[2]}`);
      const endRef = cellToRef(`${mainMatch[3]}${mainMatch[4]}`);
      for (let r = startRef.row; r <= endRef.row; r++) {
        const val = getComputedValue(r, startRef.col) || `Row ${r + 1}`;
        labels.push(val);
      }
    }

    const series: SeriesData[] = chart.series.map((s, idx) => {
      const sMatch = s.dataRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      const values: number[] = [];
      if (sMatch) {
        const sStart = cellToRef(`${sMatch[1]}${sMatch[2]}`);
        const sEnd = cellToRef(`${sMatch[3]}${sMatch[4]}`);
        for (let r = sStart.row; r <= sEnd.row; r++) {
          values.push(parseFloat(getComputedValue(r, sEnd.col)) || 0);
        }
      }
      return { label: s.label, values, color: s.color || defaultColors[idx % defaultColors.length] };
    });

    return { labels, series };
  }

  // Legacy single-range parsing: first col = labels, remaining cols = series
  const match = chart.dataRange.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return { labels: [], series: [] };

  const startRef = cellToRef(`${match[1]}${match[2]}`);
  const endRef = cellToRef(`${match[3]}${match[4]}`);
  const numCols = endRef.col - startRef.col;

  const labels: string[] = [];
  for (let r = startRef.row; r <= endRef.row; r++) {
    const labelCellId = refToCell(r, startRef.col);
    const labelData = cells[labelCellId];
    labels.push(labelData?.value != null ? String(labelData.value) : getComputedValue(r, startRef.col) || `Row ${r + 1}`);
  }

  if (numCols <= 1) {
    // Single value column
    const values: number[] = [];
    for (let r = startRef.row; r <= endRef.row; r++) {
      values.push(parseFloat(getComputedValue(r, endRef.col)) || 0);
    }
    return { labels, series: [{ label: 'Series 1', values, color: defaultColors[0] }] };
  }

  // Multiple value columns → multiple series
  const series: SeriesData[] = [];
  for (let c = startRef.col + 1; c <= endRef.col; c++) {
    const values: number[] = [];
    for (let r = startRef.row; r <= endRef.row; r++) {
      values.push(parseFloat(getComputedValue(r, c)) || 0);
    }
    // Try to get header for series name
    const headerRow = startRef.row > 0 ? startRef.row - 1 : -1;
    const headerVal = headerRow >= 0 ? getComputedValue(headerRow, c) : '';
    const label = headerVal || `Series ${c - startRef.col}`;
    series.push({ label, values, color: defaultColors[(c - startRef.col - 1) % defaultColors.length] });
  }
  return { labels, series };
}

// --- ChartCard Component ---

function ChartCard({ chart, onRemove }: { chart: ChartConfig; onRemove: () => void }) {
  const { getActiveSheet, getComputedValue, updateChartPosition } = useStore();
  const sheet = getActiveSheet();
  const [pos, setPos] = useState({ x: chart.position.x, y: chart.position.y });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  const data = useMemo(
    () => parseMultiSeriesData(chart, sheet.cells, getComputedValue),
    [chart, sheet.cells, getComputedValue],
  );

  const maxVal = useMemo(
    () => Math.max(...data.series.flatMap((s) => s.values.map(Math.abs)), 1),
    [data],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
  }, [pos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const newPos = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
    setPos(newPos);
    posRef.current = newPos;
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) updateChartPosition(chart.id, posRef.current.x, posRef.current.y);
    setIsDragging(false);
  }, [isDragging, chart.id, updateChartPosition]);

  return (
    <div
      className="absolute bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-30"
      style={{ left: pos.x, top: pos.y, width: chart.position.width, height: chart.position.height, pointerEvents: 'none' }}
    >
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
        <button className="p-0.5 text-gray-400 hover:text-red-500 rounded" onClick={onRemove}>
          <X size={14} />
        </button>
      </div>
      <div className="p-3 flex-1" style={{ height: chart.position.height - 40 }}>
        {chart.type === 'bar' || chart.type === 'column' ? (
          <BarChart data={data} maxVal={maxVal} horizontal={chart.type === 'bar'} trendLine={chart.trendLine} axisConfig={chart.axisConfig} />
        ) : chart.type === 'pie' ? (
          <PieChart data={data} />
        ) : chart.type === 'line' || chart.type === 'area' ? (
          <LineChart data={data} maxVal={maxVal} fill={chart.type === 'area'} trendLine={chart.trendLine} axisConfig={chart.axisConfig} />
        ) : chart.type === 'scatter' ? (
          <LineChart data={data} maxVal={maxVal} fill={false} trendLine={chart.trendLine} scatter axisConfig={chart.axisConfig} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Chart type: {chart.type}</div>
        )}
        {/* Legend for multi-series */}
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

// --- Bar/Column Chart ---

function BarChart({ data, maxVal, horizontal, trendLine, axisConfig }: { data: MultiSeriesChartData; maxVal: number; horizontal: boolean; trendLine?: TrendLineConfig; axisConfig?: AxisConfig }) {
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

// --- Pie Chart ---

function PieChart({ data }: { data: MultiSeriesChartData }) {
  // Pie uses only the first series
  const series = data.series[0];
  if (!series) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>;
  const total = series.values.reduce((a, b) => a + Math.abs(b), 0);
  if (total === 0) return <div className="flex items-center justify-center h-full text-gray-400 text-sm">No data</div>;

  const colors = data.series.length > 1
    ? data.series.map((s) => s.color)
    : (Array.from({ length: series.values.length }, (_, i) => ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'][i % 6]));

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

// --- Line/Area/Scatter Chart ---

function LineChart({ data, maxVal, fill, trendLine, scatter, axisConfig }: {
  data: MultiSeriesChartData; maxVal: number; fill: boolean; trendLine?: TrendLineConfig; scatter?: boolean;
  axisConfig?: AxisConfig;
}) {
  const w = 300;
  const h = 180;
  const padding = 30;
  const plotW = w - padding * 2;
  const plotH = h - padding * 2;
  const numPoints = data.labels.length;

  // Use axis config for Y scale if provided
  const effectiveMin = axisConfig?.yMin ?? 0;
  const effectiveMax = axisConfig?.yMax ?? maxVal;
  const yRange = effectiveMax - effectiveMin || 1;
  const gridVisible = axisConfig?.showGrid !== false;

  const getPoints = (values: number[]) =>
    values.map((val, i) => ({
      x: padding + (i / Math.max(numPoints - 1, 1)) * plotW,
      y: padding + plotH - ((Math.abs(val) - effectiveMin) / yRange) * plotH,
    }));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
      {/* Grid lines */}
      {gridVisible && [0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <line key={pct} x1={padding} y1={padding + plotH * (1 - pct)} x2={padding + plotW} y2={padding + plotH * (1 - pct)} stroke="#E5E7EB" strokeWidth={0.5} />
      ))}
      {/* Axis labels */}
      {axisConfig?.yLabel && (
        <text x={8} y={padding + plotH / 2} textAnchor="middle" fontSize={7} fill="#6B7280" transform={`rotate(-90, 8, ${padding + plotH / 2})`}>
          {axisConfig.yLabel}
        </text>
      )}
      {axisConfig?.xLabel && (
        <text x={padding + plotW / 2} y={h - 4} textAnchor="middle" fontSize={7} fill="#6B7280">
          {axisConfig.xLabel}
        </text>
      )}

      {/* Render each series */}
      {data.series.map((series, sIdx) => {
        const points = getPoints(series.values);
        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const areaD = pathD + ` L ${points[points.length - 1]?.x || 0} ${padding + plotH} L ${padding} ${padding + plotH} Z`;

        return (
          <g key={sIdx}>
            {fill && points.length > 1 && (
              <path d={areaD} fill={series.color} fillOpacity={0.1 + sIdx * 0.05} />
            )}
            {!scatter && points.length > 1 && (
              <path d={pathD} fill="none" stroke={series.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={scatter ? 4 : 3} fill={series.color} />
            ))}
          </g>
        );
      })}

      {/* Trend lines */}
      {trendLine && data.series.map((series, sIdx) => {
        const trendValues = computeTrendValues(series.values, trendLine);
        const trendPoints = getPoints(trendValues);
        const trendPath = trendPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        const trendColor = trendLine.color || series.color;
        return (
          <g key={`trend-${sIdx}`}>
            <path d={trendPath} fill="none" stroke={trendColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
            {trendLine.showEquation && sIdx === 0 && (
              <text x={padding + 4} y={padding - 4} fontSize={7} fill={trendColor} opacity={0.8}>
                {formatEquation(series.values, trendLine)}
              </text>
            )}
          </g>
        );
      })}

      {/* X-axis labels (only first 8 to avoid clutter) */}
      {data.labels.slice(0, 8).map((label, i) => {
        const x = padding + (i / Math.max(numPoints - 1, 1)) * plotW;
        return (
          <text key={i} x={x} y={padding + plotH + 14} textAnchor="middle" fontSize={7} fill="#9CA3AF">
            {label.slice(0, 6)}
          </text>
        );
      })}
    </svg>
  );
}
