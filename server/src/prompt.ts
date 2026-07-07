export const SPREADSHEET_AGENT_TOOLS = [
  'create_budget_template',
  'create_sales_tracker',
  'create_invoice',
  'create_project_tracker',
  'create_employee_roster',
  'apply_formula',
  'format_cells',
  'create_chart',
  'analyze_data',
  'modify_column',
  'clear_sheet',
] as const

export type SpreadsheetTool = (typeof SPREADSHEET_AGENT_TOOLS)[number]

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SpreadsheetContextInput {
  workbookName: string
  activeSheet: string
  sheetNames: string[]
  selectedCells: string[]
  cellSummary: Record<string, string | number | boolean | null>
}

export interface AgentActionInput {
  tool: string
  params: Record<string, unknown>
  description: string
}

export interface ChatRequestBody {
  message: string
  history?: ChatMessageInput[]
  context?: SpreadsheetContextInput
  /** Skip instant template routing and force LLM (slower) */
  forceLlm?: boolean
}

export interface ChatResponseBody {
  message: string
  actions: AgentActionInput[]
  source: 'llm' | 'fallback' | 'template'
}

/**
 * Build a compact system prompt — shorter = faster on small CPU models.
 */
export function buildSystemPrompt(context?: SpreadsheetContextInput): string {
  const tools = SPREADSHEET_AGENT_TOOLS.join(', ')

  // Only include a slim context — max 30 cells to keep prompt short
  let contextBlock = ''
  if (context) {
    const cellEntries = Object.entries(context.cellSummary ?? {}).slice(0, 30)
    const cellStr = cellEntries.length > 0
      ? cellEntries.map(([k, v]) => `${k}=${v ?? ''}`).join(', ')
      : 'empty'
    contextBlock = `\nSheet: "${context.activeSheet}" | Cells: ${cellStr}`
  }

  return `You are smartsh!t, a spreadsheet AI assistant. Respond ONLY with valid JSON.

Format: {"message":"explanation","actions":[{"tool":"name","params":{},"description":"label"}]}

Tools: ${tools}

Rules:
- message: plain English, friendly, short
- actions: array of tool calls (empty if just explaining)
- No markdown fences, no extra text outside JSON
${contextBlock}`
}
