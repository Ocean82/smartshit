export type IntentType =
  | 'read'
  | 'analyze'
  | 'write'
  | 'format'
  | 'create_chart'
  | 'create_formula'
  | 'summarize'
  | 'filter'
  | 'sort'
  | 'clean'
  | 'budget'
  | 'report'
  | 'compare'
  | 'find'
  | 'calculate'
  | 'export'
  | 'chat'
  | 'unknown'

export interface UserIntent {
  intentType: IntentType
  targetSheet?: string
  targetColumns: string[]
  targetRows?: string
  filters: Record<string, unknown>
  parameters: Record<string, unknown>
  rawQuery: string
  confidence: number
}

export interface ActTemplateAction {
  tool: string
  params: Record<string, unknown>
  description: string
}

export interface ActTemplateResult {
  message: string
  actions: ActTemplateAction[]
}
