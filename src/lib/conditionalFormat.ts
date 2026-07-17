import type { CellFormat, ConditionalRule, SheetData } from '@/types'
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

export type ConditionalFormatCondition = 'negative' | 'positive' | 'gt' | 'lt' | 'eq' | 'dataBar'

export function matchesConditionalFormat(
  numericValue: number,
  condition: ConditionalFormatCondition | string,
  threshold = 0,
): boolean {
  if (!Number.isFinite(numericValue)) return false
  const c = String(condition).toLowerCase()
  if (c === 'negative') return numericValue < 0
  if (c === 'positive') return numericValue > 0
  if (c === 'gt') return numericValue > threshold
  if (c === 'lt') return numericValue < threshold
  if (c === 'eq') return numericValue === threshold
  if (c === 'databar') return true
  return false
}

export function parseNumericDisplay(computed: string): number {
  return Number(String(computed).replace(/[$,\s]/g, ''))
}

export function conditionToRule(
  condition: ConditionalFormatCondition | string,
  color: string,
  threshold = 0,
): ConditionalRule {
  const c = String(condition).toLowerCase()
  const style: Partial<CellFormat> = { bgColor: color }
  if (c === 'databar') {
    return { type: 'dataBar', value: 0, style: {}, dataBarColor: color }
  }
  if (c === 'negative') return { type: 'lessThan', value: 0, style }
  if (c === 'positive') return { type: 'greaterThan', value: 0, style }
  if (c === 'gt') return { type: 'greaterThan', value: threshold, style }
  if (c === 'lt') return { type: 'lessThan', value: threshold, style }
  if (c === 'eq') return { type: 'equals', value: threshold, style }
  return { type: 'lessThan', value: 0, style }
}

export function ruleMatchesComputed(rule: ConditionalRule, computed: string): boolean {
  if (rule.type === 'text') {
    return computed.toLowerCase().includes(String(rule.value).toLowerCase())
  }
  if (rule.type === 'dataBar') {
    return Number.isFinite(parseNumericDisplay(computed))
  }
  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num)) return false
  switch (rule.type) {
    case 'greaterThan':
      return num > Number(rule.value)
    case 'lessThan':
      return num < Number(rule.value)
    case 'equals':
      return num === Number(rule.value)
    case 'between':
      return num >= Number(rule.value) && num <= Number(rule.value2 ?? rule.value)
    case 'colorScale':
      return false
    default:
      return false
  }
}

/** Merge base format with styles from matching conditional rules (data bars paint separately). */
export function resolveCellFormat(
  format: CellFormat | undefined,
  computedValue: string,
): CellFormat | undefined {
  if (!format) return undefined
  const rules = format.conditionalRules
  if (!rules?.length) return format

  let merged: CellFormat = { ...format }
  for (const rule of rules) {
    if (rule.type === 'dataBar') continue
    if (!ruleMatchesComputed(rule, computedValue)) continue
    merged = {
      ...merged,
      ...rule.style,
      borders: rule.style.borders
        ? { ...merged.borders, ...rule.style.borders }
        : merged.borders,
    }
  }
  return merged
}

/** Active data-bar rule on a cell, if the computed value is numeric. */
export function getDataBarRule(
  format: CellFormat | undefined,
  computedValue: string,
): ConditionalRule | null {
  const rule = format?.conditionalRules?.find((r) => r.type === 'dataBar')
  if (!rule) return null
  if (!ruleMatchesComputed(rule, computedValue)) return null
  return rule
}

/**
 * Proportional fill 0–100 for a numeric value among peer column values.
 * Uses the peer min as the floor (Excel-like relative bars).
 */
export function dataBarWidthPercent(computed: string, peerValues: number[]): number | null {
  const num = parseNumericDisplay(computed)
  if (!Number.isFinite(num) || peerValues.length === 0) return null
  const min = Math.min(...peerValues)
  const max = Math.max(...peerValues)
  if (max === min) return max === 0 ? 0 : 100
  return Math.max(0, Math.min(100, ((num - min) / (max - min)) * 100))
}

/** Collect finite numeric values for cells that carry a dataBar rule in a column. */
export function columnDataBarPeerValues(
  sheet: SheetData,
  columnIndex: number,
  getComputedValue: (row: number, col: number) => string,
): number[] {
  const values: number[] = []
  for (const cellId of columnDataCellIds(sheet, columnIndex)) {
    const cell = sheet.cells[cellId]
    if (!cell?.format?.conditionalRules?.some((r) => r.type === 'dataBar')) continue
    const parsed = cellToRef(cellId)
    const num = parseNumericDisplay(getComputedValue(parsed.row, parsed.col))
    if (Number.isFinite(num)) values.push(num)
  }
  return values
}

export function findConditionalFormatTargets(
  columnIndex: number,
  condition: ConditionalFormatCondition | string,
  threshold: number,
  getComputedValue: (row: number, col: number) => string,
  cellIds: string[],
  toRef: (cellId: string) => { row: number; col: number },
): string[] {
  const matches: string[] = []
  for (const cellId of cellIds) {
    const ref = toRef(cellId)
    if (ref.col !== columnIndex) continue
    const num = parseNumericDisplay(getComputedValue(ref.row, ref.col))
    if (matchesConditionalFormat(num, condition, threshold)) matches.push(cellId)
  }
  return matches
}

export function columnDataCellIds(sheet: SheetData, columnIndex: number): string[] {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const ids: string[] = []
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const cellId = refToCell(r, columnIndex)
    const cell = sheet.cells[cellId]
    if (!cell) continue
    const hasValue = cell.value != null && cell.value !== ''
    const hasFormula = !!cell.formula
    if (hasValue || hasFormula) ids.push(cellId)
  }
  return ids
}

/** @deprecated Prefer columnDataCellIds — kept for callers that need the full row span. */
export function columnCellIdsInUsedRange(sheet: SheetData, columnIndex: number): string[] {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const ids: string[] = []
  for (let r = headerRow; r <= lastRow; r++) {
    ids.push(refToCell(r, columnIndex))
  }
  return ids
}

export function attachConditionalRuleToColumn(
  sheet: SheetData,
  columnIndex: number,
  rule: ConditionalRule,
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void,
): number {
  const ids = columnDataCellIds(sheet, columnIndex)
  for (const cellId of ids) {
    // Replace rules; clear paint-once bgColor so live rules own the highlight.
    setCellFormat(cellId, { conditionalRules: [rule], bgColor: undefined })
  }
  return ids.length
}
