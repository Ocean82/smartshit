import type { SheetInsights } from '@/ai/sheetInsights'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import type { SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import type { ToolResult, UserIntent } from '@/ai/types'

function parseNumeric(value: string | number | boolean | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '')
    const num = Number(cleaned)
    if (cleaned !== '' && Number.isFinite(num)) return num
  }
  return null
}

function columnLetterToIndex(letter: string): number {
  const upper = letter.toUpperCase()
  let result = 0
  for (let i = 0; i < upper.length; i++) {
    result = result * 26 + (upper.charCodeAt(i) - 64)
  }
  return result - 1
}

function resolveColumnIndex(sheet: SheetData, column: string, headerRow = 0): number {
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    maxCol = Math.max(maxCol, cellToRef(cellId).col)
  }

  for (let c = 0; c <= maxCol; c++) {
    const header = sheet.cells[refToCell(headerRow, c)]?.value
    if (String(header ?? '').toLowerCase() === column.toLowerCase()) return c
  }

  if (/^[a-z]{1,3}$/i.test(column)) return columnLetterToIndex(column)

  return columnLetterToIndex(column.charAt(0))
}

function getRowValues(
  sheet: SheetData,
  row: number,
  maxCol: number,
  getComputedValue: (row: number, col: number) => string,
): string[] {
  const values: string[] = []
  for (let c = 0; c <= maxCol; c++) {
    const cell = sheet.cells[refToCell(row, c)]
    const computed = getComputedValue(row, c)
    const raw = cell?.formula ?? cell?.value ?? computed
    values.push(raw === null || raw === undefined ? '' : String(raw))
  }
  return values
}

export function queryTopN(
  sheet: SheetData,
  column: string,
  n: number,
  ascending: boolean,
  getComputedValue: (row: number, col: number) => string,
): ToolResult {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }

  const colIndex = resolveColumnIndex(sheet, column)
  const rows: Array<{ row: number; value: number; data: string[] }> = []

  for (let r = 1; r <= maxRow; r++) {
    const cell = sheet.cells[refToCell(r, colIndex)]
    const computed = getComputedValue(r, colIndex)
    const num = parseNumeric(cell?.formula ?? cell?.value ?? computed)
    if (num === null) continue
    rows.push({ row: r + 1, value: num, data: getRowValues(sheet, r, maxCol, getComputedValue) })
  }

  rows.sort((a, b) => (ascending ? a.value - b.value : b.value - a.value))
  const top = rows.slice(0, n)

  return {
    success: true,
    message: `Top ${n} rows by column ${column}`,
    data: top.map((r) => ({ row: r.row, value: r.value, cells: r.data })),
  }
}

export function queryAggregate(
  sheet: SheetData,
  column: string,
  op: 'sum' | 'avg' | 'count' | 'min' | 'max',
  getComputedValue: (row: number, col: number) => string,
): ToolResult {
  let maxRow = 0
  for (const cellId of Object.keys(sheet.cells)) {
    maxRow = Math.max(maxRow, cellToRef(cellId).row)
  }

  const colIndex = resolveColumnIndex(sheet, column)
  const values: number[] = []

  for (let r = 1; r <= maxRow; r++) {
    const cell = sheet.cells[refToCell(r, colIndex)]
    const computed = getComputedValue(r, colIndex)
    const num = parseNumeric(cell?.formula ?? cell?.value ?? computed)
    if (num !== null) values.push(num)
  }

  if (values.length === 0) {
    return { success: false, message: `No numeric values found in column ${column}.` }
  }

  let result = 0
  if (op === 'sum') result = values.reduce((a, b) => a + b, 0)
  if (op === 'avg') result = values.reduce((a, b) => a + b, 0) / values.length
  if (op === 'count') result = values.length
  if (op === 'min') result = Math.min(...values)
  if (op === 'max') result = Math.max(...values)

  return {
    success: true,
    message: `${op.toUpperCase()} of column ${column}: ${result.toFixed(2)}`,
    data: { op, column, result, count: values.length },
  }
}

export function querySort(
  sheet: SheetData,
  column: string,
  ascending: boolean,
  getComputedValue: (row: number, col: number) => string,
): ToolResult {
  const n = AI_ANALYSIS_CONFIG.maxRowsPreview
  const result = queryTopN(sheet, column, n, ascending, getComputedValue)
  return { ...result, message: `Sorted rows by column ${column} (${ascending ? 'ascending' : 'descending'})` }
}

type CompareOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

function compareValues(left: number, op: CompareOp, right: number): boolean {
  if (op === 'gt') return left > right
  if (op === 'gte') return left >= right
  if (op === 'lt') return left < right
  if (op === 'lte') return left <= right
  if (op === 'eq') return left === right
  return left !== right
}

export function queryFilter(
  sheet: SheetData,
  leftCol: string,
  op: CompareOp,
  rightColOrValue: string,
  getComputedValue: (row: number, col: number) => string,
): ToolResult {
  let maxRow = 0
  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }

  const leftIndex = resolveColumnIndex(sheet, leftCol)
  const rightIsColumn = Number.isNaN(Number(rightColOrValue.replace(/[$,\s]/g, '')))
    && resolveColumnIndex(sheet, rightColOrValue) >= 0
  const rightIndex = rightIsColumn ? resolveColumnIndex(sheet, rightColOrValue) : -1
  const rightLiteral = !rightIsColumn ? parseNumeric(rightColOrValue) : null

  const matches: Array<{ row: number; value: number; cells: string[] }> = []

  for (let r = 1; r <= maxRow; r++) {
    const leftCell = sheet.cells[refToCell(r, leftIndex)]
    const leftNum = parseNumeric(leftCell?.formula ?? leftCell?.value ?? getComputedValue(r, leftIndex))
    if (leftNum === null) continue

    let rightNum: number | null = rightLiteral
    if (rightIsColumn && rightIndex >= 0) {
      const rightCell = sheet.cells[refToCell(r, rightIndex)]
      rightNum = parseNumeric(rightCell?.formula ?? rightCell?.value ?? getComputedValue(r, rightIndex))
    }
    if (rightNum === null) continue

    if (compareValues(leftNum, op, rightNum)) {
      matches.push({
        row: r + 1,
        value: leftNum,
        cells: getRowValues(sheet, r, maxCol, getComputedValue),
      })
    }
  }

  return {
    success: true,
    message: `Found ${matches.length} rows where ${leftCol} ${op} ${rightColOrValue}`,
    data: matches.slice(0, AI_ANALYSIS_CONFIG.maxRowsPreview),
  }
}

export function runQueryFromIntent(
  sheet: SheetData,
  intent: UserIntent,
  getComputedValue: (row: number, col: number) => string,
  insights?: SheetInsights,
): ToolResult | null {
  const col = intent.targetColumns[0] ?? 'B'
  const n = typeof intent.parameters.n === 'number' ? intent.parameters.n : 5
  const ascending = intent.parameters.position === 'bottom'

  const compareLeft = intent.parameters.compareLeft as string | undefined
  const compareOp = (intent.parameters.compareOp as CompareOp | undefined) ?? 'gt'
  const compareRight = intent.parameters.compareRight as string | undefined

  if (intent.intentType === 'filter' && compareLeft && compareRight) {
    return queryFilter(sheet, compareLeft, compareOp, compareRight, getComputedValue)
  }

  if (intent.intentType === 'filter' && /actual.*budget|budget.*actual/i.test(intent.rawQuery) && insights) {
    const actualCol = insights.headers.find((h) => /actual/i.test(h)) ?? 'Actual'
    const budgetCol = insights.headers.find((h) => /budget/i.test(h)) ?? 'Budget'
    return queryFilter(sheet, actualCol, 'gt', budgetCol, getComputedValue)
  }

  if (intent.intentType === 'sort') {
    const sortAscending = intent.parameters.ascending !== false
    return querySort(sheet, col, sortAscending, getComputedValue)
  }

  if (intent.intentType === 'filter' || (intent.intentType === 'analyze' && intent.parameters.n)
    || (intent.intentType === 'budget' && intent.parameters.n)) {
    return queryTopN(sheet, col, n, ascending, getComputedValue)
  }

  if (intent.intentType === 'calculate') {
    const lower = intent.rawQuery.toLowerCase()
    const op = lower.includes('average') || lower.includes('avg') ? 'avg'
      : lower.includes('count') ? 'count'
      : lower.includes('min') ? 'min'
      : lower.includes('max') ? 'max'
      : 'sum'
    return queryAggregate(sheet, col, op, getComputedValue)
  }

  return null
}
