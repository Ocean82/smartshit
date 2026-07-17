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
