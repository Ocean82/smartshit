import type { ChartConfig } from '@/types'

export type { IntentType, UserIntent } from '@shared/intentTypes'

export type ColumnRole =
  | 'date'
  | 'category'
  | 'amount'
  | 'quantity'
  | 'label'
  | 'id'
  | 'percentage'
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
