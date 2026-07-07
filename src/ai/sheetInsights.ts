import type { SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import { AI_ANALYSIS_CONFIG } from '@/ai/config'
import { detectOutliers } from '@/ai/outliers'

export interface ColumnStat {
  column: string
  label: string
  sum?: number
  min?: number
  max?: number
  average?: number
  count: number
}

export interface CategoryTotal {
  category: string
  total: number
}

export interface ExpenseItem {
  label: string
  amount: number
  row?: number
}

export interface VarianceItem {
  label: string
  budget?: number
  actual?: number
  difference: number
}

export interface SheetInsights {
  headerRow: number
  headers: string[]
  columnStats: ColumnStat[]
  categoryTotals?: CategoryTotal[]
  topExpenses?: ExpenseItem[]
  negativeVariances?: VarianceItem[]
  outliers?: Array<{ column: string; row: number; value: number }>
  totalIncome?: number
  totalExpenses?: number
  netCashflow?: number
}

const MAX_CATEGORY_TOTALS = 15
const MAX_TOP_EXPENSES = 10
const MAX_VARIANCES = 10

function parseNumeric(value: string | number | boolean | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '')
    const num = Number(cleaned)
    if (cleaned !== '' && Number.isFinite(num)) return num
  }
  return null
}

function normalizeHeader(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).trim().toLowerCase()
}

function buildMatrix(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): { matrix: (string | number | null)[][]; maxRow: number; maxCol: number } {
  let maxRow = 0
  let maxCol = 0

  for (const cellId of Object.keys(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    maxRow = Math.max(maxRow, row)
    maxCol = Math.max(maxCol, col)
  }

  const rows = maxRow + 1
  const cols = maxCol + 1
  const matrix: (string | number | null)[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(null),
  )

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    const { row, col } = cellToRef(cellId)
    const computed = getComputedValue(row, col)
    const raw = cell.formula ?? cell.value
    if (raw !== null && raw !== undefined && raw !== '') {
      matrix[row][col] = raw
    } else if (computed) {
      const num = parseNumeric(computed)
      matrix[row][col] = num ?? computed
    }
  }

  return { matrix, maxRow, maxCol }
}

function detectHeaderRow(matrix: (string | number | null)[][]): number {
  const scanRows = Math.min(matrix.length, 5)
  for (let r = 0; r < scanRows; r++) {
    const row = matrix[r] ?? []
    const nonEmpty = row.filter((v) => v !== null && v !== '')
    if (nonEmpty.length < 2) continue

    const textCount = nonEmpty.filter((v) => parseNumeric(v) === null).length
    if (textCount >= nonEmpty.length * 0.5) return r
  }
  return 0
}

function findColumnIndex(headers: string[], patterns: string[]): number {
  return headers.findIndex((h) => patterns.some((p) => h.includes(p)))
}

function capInsights(insights: SheetInsights): SheetInsights {
  const json = JSON.stringify(insights)
  if (json.length <= 1500) return insights

  return {
    ...insights,
    categoryTotals: insights.categoryTotals?.slice(0, MAX_CATEGORY_TOTALS),
    topExpenses: insights.topExpenses?.slice(0, MAX_TOP_EXPENSES),
    negativeVariances: insights.negativeVariances?.slice(0, MAX_VARIANCES),
    columnStats: insights.columnStats.slice(0, 8),
  }
}

export function computeSheetInsights(
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): SheetInsights {
  const { matrix, maxRow, maxCol } = buildMatrix(sheet, getComputedValue)
  const effectiveMaxRow = Math.min(maxRow, AI_ANALYSIS_CONFIG.maxRowsAnalysis - 1)

  if (maxRow < 0 || maxCol < 0 || Object.keys(sheet.cells).length === 0) {
    return {
      headerRow: 0,
      headers: [],
      columnStats: [],
    }
  }

  const headerRow = detectHeaderRow(matrix)
  const headers = (matrix[headerRow] ?? []).map((h) => (h === null ? '' : String(h)))
  const normalizedHeaders = headers.map(normalizeHeader)

  const columnStats: ColumnStat[] = []
  for (let c = 0; c <= maxCol; c++) {
    const values: number[] = []
    for (let r = headerRow + 1; r <= maxRow; r++) {
      const num = parseNumeric(matrix[r]?.[c] ?? null)
      if (num !== null) values.push(num)
    }
    if (values.length === 0) continue

    const sum = values.reduce((a, b) => a + b, 0)
    columnStats.push({
      column: refToCell(0, c).replace(/\d+/, ''),
      label: headers[c] || `Column ${refToCell(0, c).replace(/\d+/, '')}`,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      average: sum / values.length,
      count: values.length,
    })
  }

  const insights: SheetInsights = {
    headerRow,
    headers: headers.filter(Boolean),
    columnStats,
  }

  const categoryCol = findColumnIndex(normalizedHeaders, ['category', 'item', 'description', 'name', 'expense'])
  const amountCol = findColumnIndex(normalizedHeaders, ['amount', 'actual', 'cost', 'price', 'total', 'spent'])
  const budgetCol = findColumnIndex(normalizedHeaders, ['budget', 'planned', 'plan'])
  const actualCol = findColumnIndex(normalizedHeaders, ['actual', 'spent', 'real'])
  const diffCol = findColumnIndex(normalizedHeaders, ['difference', 'diff', 'variance', 'over'])

  if (categoryCol >= 0 && amountCol >= 0) {
    const totals = new Map<string, number>()
    const expenses: ExpenseItem[] = []

    for (let r = headerRow + 1; r <= maxRow; r++) {
      const category = String(matrix[r]?.[categoryCol] ?? '').trim()
      const amount = parseNumeric(matrix[r]?.[amountCol] ?? null)
      if (!category || amount === null) continue

      totals.set(category, (totals.get(category) ?? 0) + amount)
      expenses.push({ label: category, amount, row: r + 1 })
    }

    if (totals.size > 0) {
      insights.categoryTotals = [...totals.entries()]
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, MAX_CATEGORY_TOTALS)

      insights.topExpenses = expenses
        .sort((a, b) => b.amount - a.amount)
        .slice(0, MAX_TOP_EXPENSES)

      insights.totalExpenses = [...totals.values()].reduce((a, b) => a + b, 0)
    }
  }

  if (budgetCol >= 0 && (actualCol >= 0 || diffCol >= 0)) {
    const variances: VarianceItem[] = []
    const labelCol = categoryCol >= 0 ? categoryCol : 0

    for (let r = headerRow + 1; r <= maxRow; r++) {
      const label = String(matrix[r]?.[labelCol] ?? `Row ${r + 1}`).trim()
      const budget = parseNumeric(matrix[r]?.[budgetCol] ?? null)
      const actual = actualCol >= 0 ? parseNumeric(matrix[r]?.[actualCol] ?? null) : null
      let difference = diffCol >= 0 ? parseNumeric(matrix[r]?.[diffCol] ?? null) : null

      if (difference === null && budget !== null && actual !== null) {
        difference = actual - budget
      }

      if (difference !== null && difference < 0) {
        variances.push({ label, budget: budget ?? undefined, actual: actual ?? undefined, difference })
      }
    }

    if (variances.length > 0) {
      insights.negativeVariances = variances
        .sort((a, b) => a.difference - b.difference)
        .slice(0, MAX_VARIANCES)
    }
  }

  const incomeCol = findColumnIndex(normalizedHeaders, ['income', 'revenue', 'earnings', 'salary'])
  if (incomeCol >= 0) {
    let incomeTotal = 0
    for (let r = headerRow + 1; r <= maxRow; r++) {
      const num = parseNumeric(matrix[r]?.[incomeCol] ?? null)
      if (num !== null) incomeTotal += num
    }
    if (incomeTotal > 0) insights.totalIncome = incomeTotal
  }

  if (insights.totalIncome !== undefined || insights.totalExpenses !== undefined) {
    insights.netCashflow = (insights.totalIncome ?? 0) - (insights.totalExpenses ?? 0)
  }

  const allOutliers: Array<{ column: string; row: number; value: number }> = []
  for (let c = 0; c <= maxCol; c++) {
    const label = headers[c] || `Column ${c + 1}`
    const values: Array<{ row: number; value: number }> = []
    for (let r = headerRow + 1; r <= effectiveMaxRow; r++) {
      const num = parseNumeric(matrix[r]?.[c] ?? null)
      if (num !== null) values.push({ row: r + 1, value: num })
    }
    allOutliers.push(...detectOutliers(values, label))
  }
  if (allOutliers.length > 0) insights.outliers = allOutliers.slice(0, 10)

  return capInsights(insights)
}
