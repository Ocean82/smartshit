import { parseRangeRef } from '@/lib/chartMath'
import { refToCell } from '@/lib/cellRef'
import type { CellData, ChartConfig } from '@/types'

export const DEFAULT_CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export interface SeriesData {
  label: string
  values: number[]
  color: string
}

export interface MultiSeriesChartData {
  labels: string[]
  series: SeriesData[]
}

export type ChartValueReader = (row: number, col: number) => string

type CellGrid = Record<string, CellData>

const EMPTY_CHART_DATA: MultiSeriesChartData = { labels: [], series: [] }

function chartColors(chart: ChartConfig): string[] {
  return chart.colors || DEFAULT_CHART_COLORS
}

function readColumnValues(
  startRow: number,
  endRow: number,
  col: number,
  getComputedValue: ChartValueReader,
): number[] {
  const values: number[] = []
  for (let r = startRow; r <= endRow; r++) {
    values.push(parseFloat(getComputedValue(r, col)) || 0)
  }
  return values
}

function rangeLabelAt(
  row: number,
  col: number,
  cells: CellGrid,
  getComputedValue: ChartValueReader,
): string {
  const stored = cells[refToCell(row, col)]?.value
  if (stored != null) return String(stored)
  return getComputedValue(row, col) || `Row ${row + 1}`
}

function readRangeLabels(
  startRow: number,
  endRow: number,
  labelCol: number,
  cells: CellGrid,
  getComputedValue: ChartValueReader,
): string[] {
  const labels: string[] = []
  for (let r = startRow; r <= endRow; r++) {
    labels.push(rangeLabelAt(r, labelCol, cells, getComputedValue))
  }
  return labels
}

function seriesHeaderLabel(
  startRow: number,
  col: number,
  startCol: number,
  getComputedValue: ChartValueReader,
): string {
  const headerRow = startRow > 0 ? startRow - 1 : -1
  if (headerRow < 0) return `Series ${col - startCol}`
  return getComputedValue(headerRow, col) || `Series ${col - startCol}`
}

function singleLegacySeries(
  startRow: number,
  endRow: number,
  valueCol: number,
  colors: string[],
  getComputedValue: ChartValueReader,
): SeriesData[] {
  return [{
    label: 'Series 1',
    values: readColumnValues(startRow, endRow, valueCol, getComputedValue),
    color: colors[0],
  }]
}

function multiColumnLegacySeries(
  start: { row: number; col: number },
  end: { row: number; col: number },
  colors: string[],
  getComputedValue: ChartValueReader,
): SeriesData[] {
  const series: SeriesData[] = []
  for (let c = start.col + 1; c <= end.col; c++) {
    series.push({
      label: seriesHeaderLabel(start.row, c, start.col, getComputedValue),
      values: readColumnValues(start.row, end.row, c, getComputedValue),
      color: colors[(c - start.col - 1) % colors.length],
    })
  }
  return series
}

function isSingleValueColumn(startCol: number, endCol: number): boolean {
  return endCol - startCol <= 1
}

function buildLegacySeries(
  start: { row: number; col: number },
  end: { row: number; col: number },
  colors: string[],
  getComputedValue: ChartValueReader,
): SeriesData[] {
  if (isSingleValueColumn(start.col, end.col)) {
    return singleLegacySeries(start.row, end.row, end.col, colors, getComputedValue)
  }
  return multiColumnLegacySeries(start, end, colors, getComputedValue)
}

function parseLegacyRange(
  chart: ChartConfig,
  cells: CellGrid,
  getComputedValue: ChartValueReader,
): MultiSeriesChartData {
  const ref = parseRangeRef(chart.dataRange)
  if (!ref) return EMPTY_CHART_DATA

  return {
    labels: readRangeLabels(ref.start.row, ref.end.row, ref.start.col, cells, getComputedValue),
    series: buildLegacySeries(ref.start, ref.end, chartColors(chart), getComputedValue),
  }
}

function parseExplicitSeries(
  chart: ChartConfig,
  getComputedValue: ChartValueReader,
): MultiSeriesChartData | null {
  if (!chart.series?.length) return null

  const colors = chartColors(chart)
  const ref = parseRangeRef(chart.dataRange)
  const labels: string[] = []

  if (ref) {
    for (let r = ref.start.row; r <= ref.end.row; r++) {
      labels.push(getComputedValue(r, ref.start.col) || `Row ${r + 1}`)
    }
  }

  const series: SeriesData[] = chart.series.map((s, idx) => {
    const sRef = parseRangeRef(s.dataRange)
    const values = sRef
      ? readColumnValues(sRef.start.row, sRef.end.row, sRef.end.col, getComputedValue)
      : []
    return { label: s.label, values, color: s.color || colors[idx % colors.length] }
  })

  return { labels, series }
}

export function parseMultiSeriesData(
  chart: ChartConfig,
  cells: CellGrid,
  getComputedValue: ChartValueReader,
): MultiSeriesChartData {
  if (chart.snapshot) {
    const colors = chartColors(chart)
    return {
      labels: chart.snapshot.labels,
      series: chart.snapshot.series.map((s, i) => ({
        label: s.label,
        values: s.values,
        color: s.color || colors[i % colors.length],
      })),
    }
  }
  return parseExplicitSeries(chart, getComputedValue) ?? parseLegacyRange(chart, cells, getComputedValue)
}
