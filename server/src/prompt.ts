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

export function buildSystemPrompt(context?: SpreadsheetContextInput): string {
  const tools = SPREADSHEET_AGENT_TOOLS.join(', ')
  const contextBlock = context
    ? `\n\nCurrent workbook:\n- Name: ${context.workbookName ?? 'Workbook'}\n- Active sheet: ${context.activeSheet ?? 'Sheet1'}\n- Sheets: ${(context.sheetNames ?? []).join(', ') || 'none'}\n- Selection: ${(context.selectedCells ?? []).join(', ') || 'none'}\n- Populated cells (sample): ${JSON.stringify(context.cellSummary ?? {}).slice(0, 2000)}`
    : ''

  return `You are smartsh!t, an AI assistant for everyday people managing budgets, expenses, and simple business spreadsheets.

Rules:
- Explain things in plain English. Avoid jargon unless the user asks for formulas.
- When the user wants changes, respond with JSON ONLY (no markdown fences).
- Use "actions" for spreadsheet mutations. Use an empty actions array for explanations only.
- Prefer high-level tools over raw cell writes when a template fits.

Available action tools: ${tools}

JSON response shape:
{
  "message": "friendly explanation for the user",
  "actions": [
    {
      "tool": "create_budget_template",
      "params": {},
      "description": "short label shown in preview"
    }
  ]
}

Examples:
- "build a monthly budget" -> create_budget_template
- "track sales" -> create_sales_tracker
- "explain my sheet" -> message only, actions: []
- "add 10% to column B" -> modify_column with params { "column": "B", "operation": "multiply", "factor": 1.1 }
${contextBlock}`
}
