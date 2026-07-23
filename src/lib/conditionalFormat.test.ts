import { describe, expect, it } from 'vitest'
import {
  matchesConditionalFormat,
  findConditionalFormatTargets,
  conditionToRule,
  ruleMatchesComputed,
  resolveCellFormat,
  columnDataCellIds,
  attachConditionalRuleToColumn,
} from './conditionalFormat'
import type { SheetData } from '@/types'

describe('matchesConditionalFormat', () => {
  it('matches negative and positive', () => {
    expect(matchesConditionalFormat(-5, 'negative')).toBe(true)
    expect(matchesConditionalFormat(5, 'positive')).toBe(true)
    expect(matchesConditionalFormat(0, 'negative')).toBe(false)
  })

  it('matches gt/lt/eq thresholds', () => {
    expect(matchesConditionalFormat(10, 'gt', 5)).toBe(true)
    expect(matchesConditionalFormat(3, 'lt', 5)).toBe(true)
    expect(matchesConditionalFormat(5, 'eq', 5)).toBe(true)
  })
})

describe('conditionToRule / ruleMatchesComputed', () => {
  it('maps negative to lessThan 0', () => {
    const rule = conditionToRule('negative', '#fee')
    expect(rule.type).toBe('lessThan')
    expect(rule.value).toBe(0)
    expect(ruleMatchesComputed(rule, '-3')).toBe(true)
    expect(ruleMatchesComputed(rule, '3')).toBe(false)
  })

  it('maps gt threshold', () => {
    const rule = conditionToRule('gt', '#0f0', 100)
    expect(rule.type).toBe('greaterThan')
    expect(ruleMatchesComputed(rule, '150')).toBe(true)
    expect(ruleMatchesComputed(rule, '50')).toBe(false)
  })
  it('maps dataBar and matches numeric cells', () => {
    const rule = conditionToRule('dataBar', '#93C5FD')
    expect(rule.type).toBe('dataBar')
    expect(rule.dataBarColor).toBe('#93C5FD')
    expect(ruleMatchesComputed(rule, '42')).toBe(true)
    expect(ruleMatchesComputed(rule, 'abc')).toBe(false)
    // data bars do not paint via resolveCellFormat bgColor
    expect(resolveCellFormat({ conditionalRules: [rule] }, '42')?.bgColor).toBeUndefined()
  })
})

describe('dataBarWidthPercent', () => {
  it('scales relative to peer min/max', async () => {
    const { dataBarWidthPercent } = await import('./conditionalFormat')
    expect(dataBarWidthPercent('50', [0, 50, 100])).toBe(50)
    expect(dataBarWidthPercent('100', [0, 50, 100])).toBe(100)
    expect(dataBarWidthPercent('0', [0, 50, 100])).toBe(0)
  })
})

describe('resolveCellFormat', () => {
  it('merges matching rule style without mutating base when no match', () => {
    const format = {
      bold: true,
      conditionalRules: [conditionToRule('negative', '#FEE2E2')],
    }
    expect(resolveCellFormat(format, '10')?.bgColor).toBeUndefined()
    expect(resolveCellFormat(format, '10')?.bold).toBe(true)
    expect(resolveCellFormat(format, '-1')?.bgColor).toBe('#FEE2E2')
    expect(resolveCellFormat(format, '-1')?.bold).toBe(true)
  })
})

describe('columnDataCellIds / attachConditionalRuleToColumn', () => {
  it('skips header and empty cells; clears paint-once bg', () => {
    const sheet: SheetData = {
      id: 's1',
      name: 'T',
      cells: {
        A1: { value: 'Name' },
        B1: { value: 'Amount' },
        B2: { value: -10, format: { bgColor: '#old' } },
        B3: { value: null },
        B4: { value: 20 },
        A4: { value: 'label' },
      },
      columnWidths: {},
      rowHeights: {},
      charts: [],
    }

    expect(columnDataCellIds(sheet, 1)).toEqual(['B2', 'B4'])

    const writes: Record<string, Partial<import('@/types').CellFormat>> = {}
    const count = attachConditionalRuleToColumn(
      sheet,
      1,
      conditionToRule('negative', '#FEE2E2'),
      (cellId, format) => { writes[cellId] = format },
    )
    expect(count).toBe(2)
    expect(writes.B1).toBeUndefined()
    expect(writes.B3).toBeUndefined()
    expect(writes.B2?.conditionalRules).toHaveLength(1)
    expect(writes.B2?.bgColor).toBeUndefined()
    expect(writes.B4?.conditionalRules).toHaveLength(1)
  })
})

describe('findConditionalFormatTargets', () => {
  it('returns matching cell ids in column', () => {
    const values: Record<string, string> = {
      B1: 'Amount',
      B2: '-10',
      B3: '20',
      B4: '-3',
    }
    const targets = findConditionalFormatTargets(
      1,
      'negative',
      0,
      (row, col) => values[`${String.fromCharCode(65 + col)}${row + 1}`] ?? '',
      Object.keys(values),
      (cellId) => ({
        row: parseInt(cellId.slice(1), 10) - 1,
        col: cellId.charCodeAt(0) - 65,
      }),
    )
    expect(targets.sort()).toEqual(['B2', 'B4'])
  })
})

describe('ruleMatchesComputed — new rule types', () => {
  it('matches notEquals', () => {
    expect(ruleMatchesComputed({ type: 'notEquals', value: 5, style: {} }, '5')).toBe(false)
    expect(ruleMatchesComputed({ type: 'notEquals', value: 5, style: {} }, '10')).toBe(true)
  })

  it('matches between', () => {
    const rule = { type: 'between' as const, value: 10, value2: 50, style: {} }
    expect(ruleMatchesComputed(rule, '25')).toBe(true)
    expect(ruleMatchesComputed(rule, '5')).toBe(false)
    expect(ruleMatchesComputed(rule, '60')).toBe(false)
  })

  it('matches notBetween', () => {
    const rule = { type: 'notBetween' as const, value: 10, value2: 50, style: {} }
    expect(ruleMatchesComputed(rule, '5')).toBe(true)
    expect(ruleMatchesComputed(rule, '60')).toBe(true)
    expect(ruleMatchesComputed(rule, '25')).toBe(false)
  })

  it('colorScale matches numeric values', () => {
    const rule = { type: 'colorScale' as const, value: 0, style: {} }
    expect(ruleMatchesComputed(rule, '42')).toBe(true)
    expect(ruleMatchesComputed(rule, 'text')).toBe(false)
  })

  it('iconSet matches numeric values', () => {
    const rule = { type: 'iconSet' as const, value: 0, style: {} }
    expect(ruleMatchesComputed(rule, '100')).toBe(true)
    expect(ruleMatchesComputed(rule, 'hello')).toBe(false)
  })
})

describe('getColorScaleColor', () => {
  it('interpolates 2-color scale', async () => {
    const { getColorScaleColor } = await import('./conditionalFormat')
    // Midpoint of white (#ffffff) to black (#000000) should be gray
    const mid = getColorScaleColor(50, 0, 100, [
      { type: 'min', color: '#ffffff' },
      { type: 'max', color: '#000000' },
    ])
    expect(mid).toBe('#808080')
  })

  it('returns first color at min', async () => {
    const { getColorScaleColor } = await import('./conditionalFormat')
    const color = getColorScaleColor(0, 0, 100, [
      { type: 'min', color: '#ff0000' },
      { type: 'max', color: '#0000ff' },
    ])
    expect(color).toBe('#ff0000')
  })

  it('returns last color at max', async () => {
    const { getColorScaleColor } = await import('./conditionalFormat')
    const color = getColorScaleColor(100, 0, 100, [
      { type: 'min', color: '#ff0000' },
      { type: 'max', color: '#0000ff' },
    ])
    expect(color).toBe('#0000ff')
  })
})

describe('getIconForValue', () => {
  it('returns correct icon based on thresholds', async () => {
    const { getIconForValue } = await import('./conditionalFormat')
    const config = { iconSetType: '3Arrows' as const, thresholds: [67, 33] }
    // High value → first icon (↑)
    expect(getIconForValue(80, 0, 100, config)).toBe('↑')
    // Mid value → second icon (→)
    expect(getIconForValue(50, 0, 100, config)).toBe('→')
    // Low value → third icon (↓)
    expect(getIconForValue(10, 0, 100, config)).toBe('↓')
  })

  it('respects reverseOrder', async () => {
    const { getIconForValue } = await import('./conditionalFormat')
    const config = { iconSetType: '3Arrows' as const, thresholds: [67, 33], reverseOrder: true }
    expect(getIconForValue(80, 0, 100, config)).toBe('↓')
    expect(getIconForValue(10, 0, 100, config)).toBe('↑')
  })
})

describe('getDataBarInfo — bidirectional', () => {
  it('returns positive bar for positive values', async () => {
    const { getDataBarInfo } = await import('./conditionalFormat')
    const info = getDataBarInfo('50', [0, 50, 100])
    expect(info).not.toBeNull()
    expect(info!.isNegative).toBe(false)
    expect(info!.startPoint).toBe(0)
    expect(info!.width).toBeGreaterThan(0)
  })

  it('returns negative bar for negative values', async () => {
    const { getDataBarInfo } = await import('./conditionalFormat')
    const info = getDataBarInfo('-30', [-50, 0, 50])
    expect(info).not.toBeNull()
    expect(info!.isNegative).toBe(true)
    expect(info!.startPoint).toBe(50) // zero is at 50%
    expect(info!.width).toBeGreaterThan(0)
  })

  it('returns zero width for zero value', async () => {
    const { getDataBarInfo } = await import('./conditionalFormat')
    const info = getDataBarInfo('0', [-50, 0, 50])
    expect(info).not.toBeNull()
    expect(info!.width).toBe(0)
  })
})

describe('findDuplicateValues / findUniqueValues', () => {
  it('identifies duplicates', async () => {
    const { findDuplicateValues } = await import('./conditionalFormat')
    const dupes = findDuplicateValues(['apple', 'banana', 'apple', 'cherry'])
    expect(dupes.has('apple')).toBe(true)
    expect(dupes.has('banana')).toBe(false)
  })

  it('identifies uniques', async () => {
    const { findUniqueValues } = await import('./conditionalFormat')
    const uniques = findUniqueValues(['apple', 'banana', 'apple', 'cherry'])
    expect(uniques.has('banana')).toBe(true)
    expect(uniques.has('cherry')).toBe(true)
    expect(uniques.has('apple')).toBe(false)
  })
})

describe('getTopNValues / getBottomNValues', () => {
  it('gets top 3', async () => {
    const { getTopNValues } = await import('./conditionalFormat')
    const top = getTopNValues([10, 50, 30, 80, 20], 3)
    expect(top.has(80)).toBe(true)
    expect(top.has(50)).toBe(true)
    expect(top.has(30)).toBe(true)
    expect(top.has(10)).toBe(false)
  })

  it('gets bottom 2', async () => {
    const { getBottomNValues } = await import('./conditionalFormat')
    const bottom = getBottomNValues([10, 50, 30, 80, 20], 2)
    expect(bottom.has(10)).toBe(true)
    expect(bottom.has(20)).toBe(true)
    expect(bottom.has(30)).toBe(false)
  })
})
