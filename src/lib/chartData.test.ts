import { describe, expect, it } from 'vitest'
import type { ChartConfig } from '@/types'
import { parseMultiSeriesData } from './chartData'

function chart(overrides: Partial<ChartConfig>): ChartConfig {
  return {
    id: 'c1',
    type: 'bar',
    title: 'Test',
    dataRange: 'A1:B3',
    position: { x: 0, y: 0, width: 400, height: 300 },
    ...overrides,
  }
}

describe('parseMultiSeriesData', () => {
  it('returns empty data when the range is invalid', () => {
    const data = parseMultiSeriesData(chart({ dataRange: 'not-a-range' }), {}, () => '')
    expect(data).toEqual({ labels: [], series: [] })
  })

  it('builds one series for a single value column', () => {
    const cells = {
      A1: { value: 'Jan' },
      A2: { value: 'Feb' },
    }
    const getComputedValue = (row: number, col: number) => {
      if (col === 1) return row === 0 ? '10' : '20'
      return ''
    }

    const data = parseMultiSeriesData(chart({ dataRange: 'A1:B2' }), cells, getComputedValue)

    expect(data.labels).toEqual(['Jan', 'Feb'])
    expect(data.series).toHaveLength(1)
    expect(data.series[0].label).toBe('Series 1')
    expect(data.series[0].values).toEqual([10, 20])
  })

  it('builds multiple series and reads headers from the row above', () => {
    const cells = {
      A2: { value: 'North' },
      A3: { value: 'South' },
    }
    const getComputedValue = (row: number, col: number) => {
      if (row === 0 && col === 1) return 'Q1'
      if (row === 0 && col === 2) return 'Q2'
      if (row === 1 && col === 1) return '1'
      if (row === 1 && col === 2) return '2'
      if (row === 2 && col === 1) return '3'
      if (row === 2 && col === 2) return '4'
      return ''
    }

    const data = parseMultiSeriesData(chart({ dataRange: 'A2:C3' }), cells, getComputedValue)

    expect(data.labels).toEqual(['North', 'South'])
    expect(data.series.map((s) => s.label)).toEqual(['Q1', 'Q2'])
    expect(data.series[0].values).toEqual([1, 3])
    expect(data.series[1].values).toEqual([2, 4])
  })

  it('prefers explicit series over the legacy range layout', () => {
    const getComputedValue = (row: number, col: number) => {
      if (col === 1) return String((row + 1) * 10)
      return `R${row + 1}`
    }

    const data = parseMultiSeriesData(
      chart({
        dataRange: 'A1:A2',
        series: [{ label: 'Sales', dataRange: 'B1:B2', color: '#111111' }],
      }),
      {},
      getComputedValue,
    )

    expect(data.labels).toEqual(['R1', 'R2'])
    expect(data.series).toEqual([
      { label: 'Sales', values: [10, 20], color: '#111111' },
    ])
  })

  it('falls back to computed values when a label cell has no stored value', () => {
    const getComputedValue = (row: number) => `Computed ${row + 1}`
    const data = parseMultiSeriesData(chart({ dataRange: 'A1:A1' }), {}, getComputedValue)
    expect(data.labels).toEqual(['Computed 1'])
  })
})
