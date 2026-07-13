import type { AgentMode } from './mode.js'
import type { UserIntent } from '../../shared/intentTypes.js'

export const SPREADSHEET_AGENT_TOOLS = [
  'create_budget_template',
  'create_sales_tracker',
  'create_invoice',
  'create_project_tracker',
  'create_employee_roster',
  'create_kpi_dashboard',
  'create_expense_report',
  'clean_sheet_data',
  'apply_formula',
  'format_cells',
  'create_chart',
  'modify_column',
  'clear_sheet',
] as const

export type SpreadsheetTool = (typeof SPREADSHEET_AGENT_TOOLS)[number]

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SheetDimensionsInput {
  rows: number
  cols: number
  populatedCells: number
}

export interface ColumnStatInput {
  column: string
  label: string
  sum?: number
  min?: number
  max?: number
  average?: number
  count: number
}

export interface SheetInsightsInput {
  headerRow: number
  headers: string[]
  columnStats: ColumnStatInput[]
  categoryTotals?: Array<{ category: string; total: number }>
  topExpenses?: Array<{ label: string; amount: number; row?: number }>
  negativeVariances?: Array<{ label: string; budget?: number; actual?: number; difference: number }>
  totalIncome?: number
  totalExpenses?: number
  netCashflow?: number
}

export interface ColumnProfileInput {
  name: string
  column: string
  dtype: string
  role: string
  sumVal?: number
}

export interface SheetProfileInput {
  name: string
  rowCount: number
  colCount: number
  detectedPurpose: string
  columns: ColumnProfileInput[]
}

export interface SpreadsheetContextInput {
  workbookName: string
  activeSheet: string
  sheetNames: string[]
  sheetSummaries?: Array<{
    name: string
    rows: number
    cols: number
    headers: string[]
    populatedCells: number
    isActive: boolean
  }>
  selectedCells: string[]
  dimensions?: SheetDimensionsInput
  headers?: string[]
  sampleRows?: string[][]
  sampleRowsTruncated?: boolean
  selectionSnapshot?: Record<string, string | number | null>
  insights?: SheetInsightsInput
  profile?: SheetProfileInput
  deterministicSummary?: string
  /** @deprecated legacy flat cell map */
  cellSummary?: Record<string, string | number | boolean | null>
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
  source: 'llm' | 'fallback' | 'template' | 'clarification'
  suggestions?: string[]
}

function formatContextBlock(context?: SpreadsheetContextInput): string {
  if (!context) return '\nNo spreadsheet data loaded yet.'

  const sheetNames = context.sheetNames ?? []
  const selectedCells = context.selectedCells ?? []
  const headers = context.headers ?? []

  const lines: string[] = [
    `\nWorkbook: "${context.workbookName ?? 'Untitled'}"`,
    `Active sheet: "${context.activeSheet ?? 'Sheet1'}"`,
    `Sheets: ${sheetNames.join(', ') || '(none)'}`,
  ]

  if (context.sheetSummaries?.length) {
    const summaryLines = context.sheetSummaries.map((s) => {
      const mark = s.isActive ? ' (active)' : ''
      const hdrs = (s.headers ?? []).slice(0, 8).join(', ')
      return `  - "${s.name}"${mark}: ${s.rows} rows × ${s.cols} cols${hdrs ? `; headers: ${hdrs}` : ''}`
    })
    lines.push(`Sheet overview:\n${summaryLines.join('\n')}`)
  }

  if (context.dimensions) {
    lines.push(
      `Size: ${context.dimensions.rows} rows x ${context.dimensions.cols} cols (${context.dimensions.populatedCells} cells)`,
    )
  }

  if (headers.length) {
    lines.push(`Headers: ${headers.join(' | ')}`)
  }

  if (selectedCells.length) {
    lines.push(`Selected: ${selectedCells.join(', ')}`)
  }

  if (context.selectionSnapshot && Object.keys(context.selectionSnapshot).length > 0) {
    const sel = Object.entries(context.selectionSnapshot)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    lines.push(`Selection values: ${sel}`)
  }

  if (context.sampleRows?.length) {
    const preview = context.sampleRows
      .slice(0, 15)
      .map((row, i) => `  Row ${i + 1}: ${(row ?? []).join(' | ')}`)
      .join('\n')
    lines.push(`Data preview:\n${preview}`)
    if (context.sampleRowsTruncated) {
      lines.push('Data preview is truncated. Mention this limitation before giving high-confidence conclusions.')
    }
  }

  if (context.deterministicSummary?.trim()) {
    lines.push(`Pre-computed analysis (cite these numbers):\n${context.deterministicSummary}`)
  }

  if (context.profile) {
    const p = context.profile
    lines.push(
      `Sheet profile: ${p.name} (${p.detectedPurpose}), ${p.rowCount}x${p.colCount}`,
    )
    if (p.columns?.length) {
      lines.push(
        `Columns: ${p.columns.slice(0, 8).map((c) => `${c.name}(${c.role})`).join(', ')}`,
      )
    }
  }

  if (context.insights) {
    const ins = context.insights
    const insightLines: string[] = []

    if (ins.totalIncome !== undefined) insightLines.push(`Total income: ${ins.totalIncome}`)
    if (ins.totalExpenses !== undefined) insightLines.push(`Total expenses: ${ins.totalExpenses}`)
    if (ins.netCashflow !== undefined) insightLines.push(`Net cashflow: ${ins.netCashflow}`)

    if (ins.topExpenses?.length) {
      insightLines.push(
        `Top expenses: ${ins.topExpenses.map((e) => `${e.label}=$${e.amount}`).join(', ')}`,
      )
    }

    if (ins.categoryTotals?.length) {
      insightLines.push(
        `By category: ${ins.categoryTotals.map((c) => `${c.category}=$${c.total}`).join(', ')}`,
      )
    }

    if (ins.negativeVariances?.length) {
      insightLines.push(
        `Over budget: ${ins.negativeVariances.map((v) => `${v.label} (${v.difference})`).join(', ')}`,
      )
    }

    if (ins.columnStats?.length) {
      const stats = ins.columnStats
        .filter((c) => c.sum !== undefined)
        .map((c) => `${c.label}: sum=${c.sum}, avg=${c.average?.toFixed(2)}`)
        .join('; ')
      if (stats) insightLines.push(`Column stats: ${stats}`)
    }

    if (insightLines.length > 0) {
      lines.push(`Computed insights:\n${insightLines.map((l) => `  - ${l}`).join('\n')}`)
    }
  }

  return lines.join('\n')
}

/**
 * Plain-English assistant for explain / advise / chat modes — no tools.
 * Uses a focused spreadsheet expert persona with strict formatting rules.
 */
export function buildExplainPrompt(
  context: SpreadsheetContextInput | undefined,
  mode: AgentMode,
  userIntent?: UserIntent,
): string {
  const contextBlock = formatContextBlock(context)

  const intentBlock = userIntent
    ? `\nParsed user intent: ${userIntent.intentType} (confidence ${userIntent.confidence})` +
      (userIntent.targetColumns.length ? `\nTarget columns: ${userIntent.targetColumns.join(', ')}` : '') +
      (userIntent.parameters.n ? `\nTop/bottom N: ${userIntent.parameters.n}` : '') +
      (userIntent.parameters.compareLeft ? `\nFilter: ${userIntent.parameters.compareLeft} ${userIntent.parameters.compareOp} ${userIntent.parameters.compareRight}` : '')
    : ''

  const adviseAddendum = mode === 'advise'
    ? `\nYou are also a practical finance coach. Give specific, actionable savings advice using the numbers above. Suggest realistic targets (e.g. 50/30/20 rule) when income/expenses are known. If data is missing, ask one short clarifying question.`
    : ''

  return `You are SmartSheet AI — the built-in intelligence layer of smartsh!t, a professional spreadsheet application. You are a focused, expert-level spreadsheet analyst and financial modeler embedded directly inside the user's workspace.

You have real-time access to the user's live spreadsheet data (cell values, formulas, structure), audit findings (errors, inconsistencies), and the full formula dependency graph.

You are simultaneously:
- A CPA-level financial analyst who knows budgets, forecasting, and modeling cold
- A senior Excel power user who knows every function
- A data quality auditor trained to catch subtle spreadsheet errors
- A patient teacher who explains complex concepts simply

PERSONALITY: Direct, confident, honest, practical. Every sentence earns its place. Lead with the answer, follow with explanation. Dry humor is fine — sarcasm at the user's expense is not.

FORMATTING RULES:
- Use markdown: headers, bold, code blocks, tables, bullet lists
- Formulas always in code blocks: \`=SUMIF(A:A, "Q1", B:B)\`
- Cell references ALWAYS use Excel A1 notation with column letters: A1, B12, C9:C20 — never "column 3" or "row 9 column 5"
- When a header name exists, you may say "Amount (column C)" or "**C9** (Amount)" — letter first
- If the workbook has multiple sheets, name the sheet when talking about non-active tabs
- Numbers with context: "$2,400 (up 12% from last month)" not just "2400"
- Lead with the answer, then explain. Never "First let me explain X, then..."
- Short paragraphs: 2-3 sentences max before a line break
- Bold the key takeaway in any response longer than 4 lines
- Max response: 200 words for explanations, 6 steps for debugging

LENGTH RULES:
- Simple formula question → 1-3 lines + code block
- Debugging → numbered steps, max 6
- Explanation → max 200 words + example
- "What's wrong?" → triage by severity, max 5 bullets

CLARIFICATION RULES:
- Ask max 2 clarifying questions at a time
- Ask only when: user says "fix it" with no specifics, references cells that don't exist, or request could destroy data
- Do NOT ask when: simple formula question, clear error, "what does X mean", or one obvious interpretation exists
- If asking, include your best guess alongside the question

WHAT NOT TO DO:
- Do NOT suggest creating templates unless explicitly asked
- Do NOT output JSON or tool calls
- Do NOT go off-topic — redirect politely if user asks non-spreadsheet things
- Do NOT hedge unnecessarily — if you know the answer, say it clearly
${adviseAddendum}
${intentBlock}
${contextBlock}`
}

/**
 * JSON tool-calling assistant for act mode.
 */
export function buildActionPrompt(context?: SpreadsheetContextInput): string {
  const tools = SPREADSHEET_AGENT_TOOLS.join(', ')
  const contextBlock = formatContextBlock(context)

  return `You are smartsh!t, a spreadsheet AI assistant. Respond ONLY with valid JSON.

Format: {"message":"explanation","actions":[{"tool":"name","params":{},"description":"label"}]}

Tools: ${tools}

Rules:
- message: plain English, friendly, short
- actions: array of tool calls (empty array if no sheet changes needed)
- No markdown fences, no extra text outside JSON
${contextBlock}`
}

/** @deprecated use buildActionPrompt or buildExplainPrompt */
export function buildSystemPrompt(context?: SpreadsheetContextInput): string {
  return buildActionPrompt(context)
}
