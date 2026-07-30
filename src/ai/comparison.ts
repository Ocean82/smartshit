import type { ColumnProfile, ToolResult } from '@/ai/types'
import { buildSheetProfile } from '@/ai/sheetProfile'
import type { SheetData, WorkbookData } from '@/types'
import { refToCell } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { findSummaryRowIndexes } from '@/lib/sheetRows'
import { escapeRegex } from '@/lib'
import { parseNumeric } from '@/ai/utils'

export type SheetValueGetter = (sheetId: string, row: number, col: number) => string

interface ComparedValue {
  label: string
  left: number
  right: number
  role: ColumnProfile['role']
}

function phraseAppears(message: string, phrase: string): boolean {
  const trimmed = phrase.trim()
  if (!trimmed) return false
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(trimmed)}(?=$|[^a-z0-9])`, 'i').test(message)
}

function sheetGetter(getValue: SheetValueGetter, sheet: SheetData) {
  return (row: number, col: number) => getValue(sheet.id, row, col)
}

function aggregateColumn(
  sheet: SheetData,
  column: ColumnProfile,
  getValue: SheetValueGetter,
): number | null {
  const colIndex = column.column
    .split('')
    .reduce((value, char) => value * 26 + char.toUpperCase().charCodeAt(0) - 64, 0) - 1
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  let sum = 0
  let count = 0
  const totalRows = findSummaryRowIndexes(sheet, sheetGetter(getValue, sheet))

  for (let row = headerRow + 1; row <= lastRow; row++) {
    // Do not double count a displayed totals row alongside its source values.
    if (totalRows.has(row)) continue
    const cell = sheet.cells[refToCell(row, colIndex)]
    const numeric = parseNumeric(getValue(sheet.id, row, colIndex) || cell?.value)
    if (numeric == null) continue
    sum += numeric
    count++
  }
  return count > 0 ? sum : null
}

function numericColumns(columns: ColumnProfile[]): ColumnProfile[] {
  return columns.filter((column) => column.dtype === 'number' && column.nonNullCount > 0)
}

function chooseAmountColumn(columns: ColumnProfile[], message: string): ColumnProfile | null {
  const numeric = numericColumns(columns)
  const mentioned = numeric.filter((column) => phraseAppears(message, column.name))
  if (mentioned.length === 1) return mentioned[0]

  const amounts = numeric.filter((column) => column.role === 'amount')
  if (amounts.length === 1) return amounts[0]
  if (amounts.length > 1) {
    const scored = amounts.map((column) => {
      const header = column.name.toLowerCase()
      let score = 0
      if (/expense|spend|cost/.test(message) && /expense|spent|actual|amount|cost/.test(header)) score += 3
      if (/revenue|income/.test(message) && /revenue|income|amount/.test(header)) score += 3
      if (/actual/.test(message) && /actual/.test(header)) score += 4
      if (/budget|planned/.test(message) && /budget|planned/.test(header)) score += 4
      if (/amount|total/.test(header)) score += 1
      return { column, score }
    }).sort((a, b) => b.score - a.score)
    if (scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? -1)) return scored[0].column
  }
  return numeric.length === 1 ? numeric[0] : null
}

function resolveSheetPair(
  workbook: WorkbookData,
  activeSheet: SheetData,
  message: string,
): [SheetData, SheetData] | null {
  const mentioned = workbook.sheets
    .filter((sheet) => phraseAppears(message, sheet.name))

  if (mentioned.length >= 2) return [mentioned[0], mentioned[1]]
  if (mentioned.length === 1 && mentioned[0].id !== activeSheet.id) {
    return [activeSheet, mentioned[0]]
  }

  const asksRelativeSheet = /\b(?:this|current)\s+(?:month(?:'s)?\s+)?(?:sheet|tab)|\b(?:last|previous|prior|other)\s+(?:month(?:'s)?\s+)?(?:sheet|tab)/i.test(message)
  if (!asksRelativeSheet) return null

  const activeIndex = workbook.sheets.findIndex((sheet) => sheet.id === activeSheet.id)
  const previous = activeIndex > 0
    ? workbook.sheets[activeIndex - 1]
    : workbook.sheets.find((sheet) => sheet.id !== activeSheet.id)
  return previous ? [previous, activeSheet] : null
}

function formatNumber(value: number, role: ColumnProfile['role']): string {
  const formatted = value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return role === 'amount' ? `$${formatted}` : formatted
}

function comparisonSentence(
  leftName: string,
  rightName: string,
  item: ComparedValue,
): string {
  const difference = item.right - item.left
  const direction = difference === 0 ? 'the same as' : difference > 0 ? 'higher than' : 'lower than'
  const percent = item.left === 0 ? null : Math.abs(difference / item.left) * 100
  if (difference === 0) return `**${item.label}:** ${rightName} is the same as ${leftName}.`
  return `**${item.label}:** ${rightName} is ${formatNumber(Math.abs(difference), item.role)}${percent == null ? '' : ` (${percent.toFixed(1)}%)`} ${direction} ${leftName}.`
}

function buildComparisonMessage(
  leftName: string,
  rightName: string,
  values: ComparedValue[],
): string {
  const lines = [
    '### Comparison',
    '',
    `| Metric | ${leftName} | ${rightName} |`,
    '|---|---:|---:|',
    ...values.map((item) => `| ${item.label} | ${formatNumber(item.left, item.role)} | ${formatNumber(item.right, item.role)} |`),
    '',
    ...values.map((item) => comparisonSentence(leftName, rightName, item)),
  ]
  return lines.join('\n')
}

function compareSheets(
  leftSheet: SheetData,
  rightSheet: SheetData,
  message: string,
  getValue: SheetValueGetter,
): ToolResult {
  const leftProfile = buildSheetProfile(leftSheet, sheetGetter(getValue, leftSheet))
  const rightProfile = buildSheetProfile(rightSheet, sheetGetter(getValue, rightSheet))
  const leftChoice = chooseAmountColumn(leftProfile.columns, message)
  const rightChoice = chooseAmountColumn(rightProfile.columns, message)
  const values: ComparedValue[] = []

  if (leftChoice && rightChoice) {
    const left = aggregateColumn(leftSheet, leftChoice, getValue)
    const right = aggregateColumn(rightSheet, rightChoice, getValue)
    if (left != null && right != null) {
      values.push({
        label: leftChoice.name.toLowerCase() === rightChoice.name.toLowerCase()
          ? leftChoice.name
          : `${leftChoice.name} / ${rightChoice.name}`,
        left,
        right,
        role: leftChoice.role === 'amount' || rightChoice.role === 'amount' ? 'amount' : leftChoice.role,
      })
    }
  }

  // If no single metric was implied, compare numeric columns with matching
  // headers. This supports budget/actual workbooks without guessing one metric.
  if (values.length === 0) {
    const rightByName = new Map(
      numericColumns(rightProfile.columns).map((column) => [column.name.trim().toLowerCase(), column]),
    )
    for (const leftColumn of numericColumns(leftProfile.columns)) {
      const rightColumn = rightByName.get(leftColumn.name.trim().toLowerCase())
      if (!rightColumn) continue
      const left = aggregateColumn(leftSheet, leftColumn, getValue)
      const right = aggregateColumn(rightSheet, rightColumn, getValue)
      if (left == null || right == null) continue
      if (values.push({ label: leftColumn.name, left, right, role: leftColumn.role }) >= 6) break
    }
  }

  if (values.length === 0) {
    return {
      success: true,
      message: `I found sheets **${leftSheet.name}** and **${rightSheet.name}**, but not a common numeric metric to compare. Name a column, such as “compare Amount in ${leftSheet.name} and ${rightSheet.name}.”`,
      suggestions: [`Compare the Amount column in ${leftSheet.name} and ${rightSheet.name}`],
    }
  }

  return {
    success: true,
    message: buildComparisonMessage(leftSheet.name, rightSheet.name, values),
  }
}

function compareColumns(
  sheet: SheetData,
  message: string,
  getValue: SheetValueGetter,
): ToolResult | null {
  const profile = buildSheetProfile(sheet, sheetGetter(getValue, sheet))
  const mentioned = numericColumns(profile.columns)
    .filter((column) => phraseAppears(message, column.name))
  if (mentioned.length < 2) return null

  const [leftColumn, rightColumn] = mentioned
  const left = aggregateColumn(sheet, leftColumn, getValue)
  const right = aggregateColumn(sheet, rightColumn, getValue)
  if (left == null || right == null) return null

  return {
    success: true,
    message: buildComparisonMessage(
      leftColumn.name,
      rightColumn.name,
      [{
        label: 'Total',
        left,
        right,
        role: leftColumn.role === 'amount' || rightColumn.role === 'amount' ? 'amount' : leftColumn.role,
      }],
    ),
  }
}

function compareRows(
  sheet: SheetData,
  message: string,
  getValue: SheetValueGetter,
): ToolResult | null {
  const profile = buildSheetProfile(sheet, sheetGetter(getValue, sheet))
  const labelColumn = profile.columns.find((column) => ['category', 'label', 'date'].includes(column.role))
    ?? profile.columns.find((column) => column.dtype !== 'number')
  const amountColumn = chooseAmountColumn(profile.columns, message)
  if (!labelColumn || !amountColumn) return null

  const labelColIndex = labelColumn.column
    .split('')
    .reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1
  const amountColIndex = amountColumn.column
    .split('')
    .reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1
  const labels = new Map<string, { label: string; total: number }>()
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const totalRows = findSummaryRowIndexes(sheet, sheetGetter(getValue, sheet))

  for (let row = headerRow + 1; row <= lastRow; row++) {
    if (totalRows.has(row)) continue
    const label = getValue(sheet.id, row, labelColIndex).trim()
      || String(sheet.cells[refToCell(row, labelColIndex)]?.value ?? '').trim()
    const amount = parseNumeric(
      getValue(sheet.id, row, amountColIndex)
      || sheet.cells[refToCell(row, amountColIndex)]?.value,
    )
    if (!label || amount == null) continue
    const key = label.toLowerCase()
    labels.set(key, { label, total: (labels.get(key)?.total ?? 0) + amount })
  }

  const mentioned = [...labels.values()].filter((item) => phraseAppears(message, item.label))
  if (mentioned.length < 2) return null
  const [left, right] = mentioned
  return {
    success: true,
    message: buildComparisonMessage(
      left.label,
      right.label,
      [{ label: amountColumn.name, left: left.total, right: right.total, role: amountColumn.role }],
    ),
  }
}

/** Deterministic comparison across sheets, columns, or labeled rows. */
export function queryComparison(
  workbook: WorkbookData,
  activeSheet: SheetData,
  message: string,
  getValue: SheetValueGetter,
): ToolResult {
  const lower = message.toLowerCase()
  const sheets = resolveSheetPair(workbook, activeSheet, lower)
  if (sheets) return compareSheets(sheets[0], sheets[1], lower, getValue)

  const columns = compareColumns(activeSheet, lower, getValue)
  if (columns) return columns

  const rows = compareRows(activeSheet, lower, getValue)
  if (rows) return rows

  const candidates = buildSheetProfile(activeSheet, sheetGetter(getValue, activeSheet)).columns
    .filter((column) => column.dtype === 'number')
    .map((column) => column.name)
  return {
    success: true,
    message: `What should I compare? Name two sheets, two row labels, or two numeric columns${candidates.length ? ` (for example, ${candidates.slice(0, 3).join(' or ')})` : ''}.`,
    suggestions: workbook.sheets.length > 1
      ? [`Compare ${workbook.sheets[0].name} and ${workbook.sheets[1].name}`]
      : undefined,
  }
}
