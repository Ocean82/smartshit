import type { ChartConfig, ProviderMeta } from '@/types'

export type { IntentType, UserIntent } from '@shared/intentTypes'

/**
 * What a column holds, from `inferRole` in sheetProfile.ts.
 *
 * `amount` means MONEY: it is shown with a currency symbol in chat, insight
 * cards and the makeover, and it is the only role summed as expenses. Assign it
 * only on evidence (a money word in the header, currency formatting, or
 * currency symbols in the cells). For "a number to add up", which also covers
 * hours and quantities, use `roleCandidates(columns, 'amount')` in goals/matchGoal.ts.
 */
export type ColumnRole =
  | 'date'
  /** Text that groups rows: item, vendor, employee, project. */
  | 'category'
  /** Money. See above. */
  | 'amount'
  /** A plain number: hours, counts, quantities, scores. Never shown as money. */
  | 'quantity'
  /** Text that is not a grouping column. */
  | 'label'
  /** An identifier (employee ID, SKU, phone, bin). Never summed, averaged or flagged as unusual. */
  | 'id'
  | 'percentage'
  /** Free text. Not produced by inferRole today. */
  | 'description'
  | 'unknown'

export type SheetPurpose = 'budget' | 'invoice' | 'inventory' | 'sales' | 'generic'

export interface ColumnProfile {
  name: string
  column: string
  dtype: string
  role: ColumnRole
  nonNullCount: number
  nullCount: number
  uniqueCount: number
  sampleValues: (string | number)[]
  minVal?: number
  maxVal?: number
  meanVal?: number
  medianVal?: number
  sumVal?: number
}

export interface SheetProfile {
  name: string
  rowCount: number
  colCount: number
  columns: ColumnProfile[]
  detectedPurpose: SheetPurpose
  hasHeaders: boolean
  hasTotalsRow: boolean
}

export interface ToolResult {
  success: boolean
  message: string
  data?: unknown
  suggestions?: string[]
  chartConfig?: ChartConfig
  toolUsed?: string
  reasoning?: string
  providerMeta?: ProviderMeta
  actions?: Array<{
    tool: string
    params: Record<string, unknown>
    description: string
  }>
}

export interface BudgetAnalysis {
  overspendingCategories: Array<{ category: string; amount: number }>
  savingsRate?: number
  monthlyIncome?: number
  monthlyExpenses?: number
  recommendation503020?: { needs: number; wants: number; savings: number }
  summary: string
}

export interface AttachedFilePreview {
  fileName: string
  workbook: import('@/types').WorkbookData
  importWarnings?: string[]
  context: import('@/ai/buildContext').SpreadsheetContextPayload
}
