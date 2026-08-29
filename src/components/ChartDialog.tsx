import React, { useState } from 'react';
import { useStore } from '@/store/useStore';
import { X, BarChart3, LineChart, PieChart, TrendingUp } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { ChartConfig, TrendLineConfig, AxisConfig } from '@/types';
import { defaultChartPosition, getChartOverlayBounds } from '@/lib/chartLayout';

const chartTypes: { type: ChartConfig['type']; icon: React.ReactNode; label: string }[] = [
  { type: 'bar', icon: <BarChart3 size={24} />, label: 'Bar Chart' },
  { type: 'column', icon: <BarChart3 size={24} className="rotate-90" />, label: 'Column' },
  { type: 'line', icon: <LineChart size={24} />, label: 'Line Chart' },
  { type: 'pie', icon: <PieChart size={24} />, label: 'Pie Chart' },
  { type: 'area', icon: <TrendingUp size={24} />, label: 'Area Chart' },
];

const trendTypes: { value: TrendLineConfig['type']; label: string }[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'movingAverage', label: 'Moving Avg' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'polynomial', label: 'Polynomial' },
];

export function ChartDialog() {
  const { showChartDialog, setShowChartDialog, addChart, selection } = useStore();
  const [selectedType, setSelectedType] = useState<ChartConfig['type']>('bar');
  const [title, setTitle] = useState('My Chart');
  const [enableTrend, setEnableTrend] = useState(false);
  const [trendType, setTrendType] = useState<TrendLineConfig['type']>('linear');
  const [showEquation, setShowEquation] = useState(false);
  const [yMin, setYMin] = useState('');
  const [yMax, setYMax] = useState('');
  const [xLabel, setXLabel] = useState('');
  const [yLabel, setYLabel] = useState('');
  const [showGrid, setShowGrid] = useState(true);
  const containerRef = useFocusTrap<HTMLDivElement>(showChartDialog, () => setShowChartDialog(false));

  if (!showChartDialog) return null;

  const supportsTrend = selectedType !== 'pie';
  const supportsAxis = selectedType !== 'pie';

  const handleCreate = () => {
    const axisConfig: AxisConfig | undefined = supportsAxis && (yMin || yMax || xLabel || yLabel || !showGrid)
      ? {
          yMin: yMin ? Number(yMin) : undefined,
          yMax: yMax ? Number(yMax) : undefined,
          xLabel: xLabel || undefined,
          yLabel: yLabel || undefined,
          showGrid,
        }
      : undefined;

    const chart: ChartConfig = {
      id: uuid(),
      type: selectedType,
      title,
      dataRange: selection
        ? `${String.fromCharCode(65 + Math.min(selection.startCol, selection.endCol))}${Math.min(selection.startRow, selection.endRow) + 1}:${String.fromCharCode(65 + Math.max(selection.startCol, selection.endCol))}${Math.max(selection.startRow, selection.endRow) + 1}`
        : 'A1:B10',
      position: defaultChartPosition(getChartOverlayBounds()),
      colors: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'],
      trendLine: enableTrend && supportsTrend ? { type: trendType, showEquation } : undefined,
      axisConfig,
    };
    addChart(chart);
    setShowChartDialog(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
      <div
        ref={containerRef}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:w-[480px] max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-dialog-title"
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h3 id="chart-dialog-title" data-focus-on-open tabIndex={-1} className="text-sm font-semibold text-gray-800">Insert Chart</h3>
          <button
            className="p-2 -mr-1 text-gray-400 hover:text-gray-600 rounded-lg active:bg-gray-100"
            onClick={() => setShowChartDialog(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 overscroll-contain">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Chart Title</label>
            <input
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-2">Chart Type</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {chartTypes.map((ct) => (
                <button
                  key={ct.type}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors min-h-[60px] ${
                    selectedType === ct.type
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300 active:bg-gray-50'
                  }`}
                  onClick={() => setSelectedType(ct.type)}
                >
                  {ct.icon}
                  <span className="text-[10px] font-medium">{ct.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Data Range</label>
            <p className="text-xs text-gray-400">
              {selection
                ? `Selected: ${String.fromCharCode(65 + Math.min(selection.startCol, selection.endCol))}${Math.min(selection.startRow, selection.endRow) + 1}:${String.fromCharCode(65 + Math.max(selection.startCol, selection.endCol))}${Math.max(selection.startRow, selection.endRow) + 1}`
                : 'Select cells first, or using default range A1:B10'}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Tip: Select multiple value columns for multi-series charts. First column = labels, remaining = series.
            </p>
          </div>

          {supportsTrend && (
            <div className="mb-4 border border-gray-100 rounded-lg p-3">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableTrend}
                  onChange={(e) => setEnableTrend(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Add Trend Line
              </label>
              {enableTrend && (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-1">
                    {trendTypes.map((t) => (
                      <button
                        key={t.value}
                        className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                          trendType === t.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                        onClick={() => setTrendType(t.value)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={showEquation} onChange={(e) => setShowEquation(e.target.checked)} className="rounded border-gray-300" />
                    Show equation
                  </label>
                </div>
              )}
            </div>
          )}

          {supportsAxis && (
            <div className="mb-4 border border-gray-100 rounded-lg p-3">
              <label className="block text-xs font-medium text-gray-600 mb-2">Axis Configuration</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Y-Axis Min</label>
                  <input
                    type="number"
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400"
                    value={yMin}
                    onChange={(e) => setYMin(e.target.value)}
                    placeholder="Auto"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Y-Axis Max</label>
                  <input
                    type="number"
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400"
                    value={yMax}
                    onChange={(e) => setYMax(e.target.value)}
                    placeholder="Auto"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">X-Axis Label</label>
                  <input
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400"
                    value={xLabel}
                    onChange={(e) => setXLabel(e.target.value)}
                    placeholder="None"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Y-Axis Label</label>
                  <input
                    className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md outline-none focus:border-blue-400"
                    value={yLabel}
                    onChange={(e) => setYLabel(e.target.value)}
                    placeholder="None"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="rounded border-gray-300" />
                Show gridlines
              </label>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2 shrink-0 safe-area-bottom">
          <button
            className="px-4 py-2.5 text-xs text-gray-600 hover:bg-gray-100 active:bg-gray-200 rounded-lg min-h-[44px]"
            onClick={() => setShowChartDialog(false)}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 min-h-[44px]"
            onClick={handleCreate}
          >
            Create Chart
          </button>
        </div>
      </div>
    </div>
  );
}
