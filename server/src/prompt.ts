import type { AgentMode } from './mode.js'
import type { UserIntent } from '../../shared/intentTypes.js'
import { ACTION_TOOL_NAMES, formatToolsForPrompt } from '../../shared/toolRegistry.js'
import { PERSONA_PROMPT } from './prompts/persona.js'
import { CLARIFICATION_RULES } from './prompts/clarification.js'

/** Action tools the LLM may return — derived from the shared registry. */
export const SPREADSHEET_AGENT_TOOLS: readonly string[] = ACTION_TOOL_NAMES

export type SpreadsheetTool = string

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
  userPreferences?: Record<string, string>
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
  /** User-provided API key (Bring Your Own Key) */
  byok?: {
    provider: string
    apiKey: string
    model: string
    baseUrl: string
  }
}

export interface ChatResponseBody {
  message: string
  actions: AgentActionInput[]
  source: 'llm' | 'fallback' | 'template' | 'clarification'
  reasoning?: string
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
      .slice(0, 50)
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

  if (context.userPreferences && Object.keys(context.userPreferences).length > 0) {
    const prefs = Object.entries(context.userPreferences)
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join('\n')
    lines.push(`User preferences (respect these):\n${prefs}`)
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

  return `${PERSONA_PROMPT}

${CLARIFICATION_RULES}
${adviseAddendum}
${intentBlock}
${contextBlock}`
}

/**
 * JSON tool-calling assistant for act mode.
 */
export function buildActionPrompt(context?: SpreadsheetContextInput): string {
  const contextBlock = formatContextBlock(context)

  return `You are smartsh!t, a spreadsheet AI assistant. Respond ONLY with valid JSON.

Format: {"reasoning":"thought process","message":"explanation","actions":[{"tool":"name","params":{},"description":"label"}]}

Reasoning traces: Use the "reasoning" field to explain your step-by-step logic BEFORE deciding on the actions. This is for your internal Chain-of-Thought and will be shown to the user as a transparency log.

Available tools and their params:
${formatToolsForPrompt()}

format_cells condition examples (shape: {operator, value?}):
- Highlight cells containing 4: {"tool":"format_cells","params":{"condition":{"operator":"contains","value":"4"},"bgColor":"#FFF9C4"}}
- Red font for negatives in column B: {"tool":"format_cells","params":{"range":"B","condition":{"operator":"negative"},"fontColor":"#FF0000"}}
- Highlight values over 500: {"tool":"format_cells","params":{"condition":{"operator":"gt","value":500},"bgColor":"#FFE0B2"}}
- Format column B as currency: {"tool":"format_cells","params":{"range":"B","numberFormat":"currency"}}
- Show column C as percentages: {"tool":"format_cells","params":{"range":"C","numberFormat":"percent"}}

execute_script — use for complex operations needing loops, conditionals, or multi-step logic:
- The script runs in a sandboxed JS environment with NO access to DOM, network, or imports.
- Available API: getCell(ref), getRawCell(ref), getRange(start,end), getHeaders(), getRowCount(), getColCount(), findCells(col,condition,value?)
- Write API: setCell(ref,value,formula?), setCells(updates), setFormat(ref,{bold?,italic?,bgColor?,fontColor?,numberFormat?}), deleteRow(row), insertRow(afterRow)
- Utility: cellRef(row,col), parseRef(ref), colToIndex(letter), indexToCol(index), log(msg)
- Rows/cols are 0-indexed. cellRef(0,0) = "A1". Row 0 is typically headers.
- Write simple, readable JavaScript. No async, no imports, no fetch, no eval.

execute_script examples:
- Fill blanks with value above: {"tool":"execute_script","params":{"code":"const rows = getRowCount()\\nfor (let row = 1; row < rows; row++) {\\n  const ref = cellRef(row, 1)\\n  if (getCell(ref) === null) {\\n    const above = getCell(cellRef(row - 1, 1))\\n    if (above !== null) setCell(ref, above)\\n  }\\n}","description":"Fill blank cells in column B with the value from the row above"}}
- Running total: {"tool":"execute_script","params":{"code":"let running = 0\\nfor (let row = 1; row < getRowCount(); row++) {\\n  const val = Number(getCell(cellRef(row, 2)))\\n  if (!isNaN(val)) { running += val; setCell(cellRef(row, 3), running) }\\n}","description":"Add running total in column D based on column C"}}
- Highlight high values: {"tool":"execute_script","params":{"code":"for (let row = 1; row < getRowCount(); row++) {\\n  const ref = cellRef(row, 4)\\n  const val = Number(String(getCell(ref)).replace(/[$,]/g, ''))\\n  if (!isNaN(val) && val > 1000) setFormat(ref, { bgColor: '#FEE2E2', bold: true })\\n}","description":"Highlight cells over $1000 in column E"}}

When to use execute_script vs other tools:
- Simple set/format/sort/filter → use the dedicated tool (faster, no script needed)
- Needs a loop, condition, or multi-cell logic → use execute_script
- If in doubt and the request involves "every row", "all blanks", "based on condition" → execute_script

Rules:
- message: plain English, friendly, short. Describe what you will do.
- actions: array of tool calls (empty array if no sheet changes needed)
- For conditional formatting (color cells by value), use format_cells with a condition param
- Read/analysis questions (totals, top N, duplicates, summaries) are answered in the message prose using the provided context — never emit actions for them
- No markdown fences, no extra text outside JSON. Start with { end with }
${contextBlock}`
}

/** @deprecated use buildActionPrompt or buildExplainPrompt */
export function buildSystemPrompt(context?: SpreadsheetContextInput): string {
  return buildActionPrompt(context)
}
