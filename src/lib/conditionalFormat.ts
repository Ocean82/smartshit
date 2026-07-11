import type { CellFormat, ConditionalRule, SheetData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'

export type ConditionalFormatCondition = 'negative' | 'positive' | 'gt' | 'lt' | 'eq'

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

/** Merge base format with styles from matching conditional rules. */
export function resolveCellFormat(
  format: CellFormat | undefined,
  computedValue: string,
): CellFormat | undefined {
  if (!format) return undefined
  const rules = format.conditionalRules
  if (!rules?.length) return format

  let merged: CellFormat = { ...format }
  for (const rule of rules) {
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
  const ids = columnCellIdsInUsedRange(sheet, columnIndex)
  for (const cellId of ids) {
    setCellFormat(cellId, { conditionalRules: [rule] })
  }
  return ids.length
}
