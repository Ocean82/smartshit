/**
 * Agent Executor — runs parsed tool calls against the spreadsheet store.
 * This is the "Kiro for spreadsheets" execution engine.
 * 
 * Flow: User message → Parser → Executor → Store mutations → Response
 */

import type { ParsedToolCall } from './parser'
import type { SheetData, FilterConfig, CellFormat, ChartConfig } from '@/types'
import type { SortPatch } from '@/lib/sheetSort'
import { resolveToolName, TEMPLATE_TOOL_NAMES } from '@shared/toolRegistry'
import { runScript } from '@/sandbox'
import { recordTelemetry } from '@/ai/telemetry'
import { TOOL_HANDLERS } from './toolHandlers'

export interface ExecutionContext {
  getActiveSheet: () => SheetData
  getSheets: () => SheetData[]
  getComputedValue: (row: number, col: number, sheetId?: string) => string
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
  setCellValidation?: (cellId: string, validation: import('@/types').DataValidation | null) => void
  /** Batched cell write — strongly preferred over looping setCellValue. */
  bulkSetCells: (cells: Record<string, { value: string | number | boolean | null; formula?: string }>) => void
  applySortPatch: (patch: SortPatch) => void
  setFilters: (filters: FilterConfig[]) => void
  deleteRow: (row: number) => void
  insertRow: (afterRow: number) => void
  addSheet: (name?: string) => void
  renameSheet: (sheetId: string, name: string) => void
  pushHistory: (desc: string) => void
  /** Currently selected cell ids, if any (used by format_cells defaults). */
  getSelection?: () => string[]
  /** Adds a chart to the active sheet (used by create_chart). */
  addChart?: (chart: ChartConfig) => void
  /** Runs a create_* template via the template module (src/templates). */
  executeTemplate?: (tool: string, params: Record<string, unknown>) => ExecutionResult
  /** Trigger the application's existing browser download handlers. */
  exportData?: (format: 'csv' | 'xlsx' | 'json') => void
}

export interface ExecutionResult {
  success: boolean
  message: string
  modified: number  // Number of cells affected
}

/**
 * Execute a single tool call against the spreadsheet.
 *
 * Never throws: tool params arrive from an LLM or a regex parser and are not
 * guaranteed to be well-formed, so any unexpected error is converted into a
 * failed ExecutionResult rather than propagating into the React tree (which
 * would blank the app via the error boundary).
 */
export function executeTool(call: ParsedToolCall, ctx: ExecutionContext): ExecutionResult {
  try {
    return executeToolInner(call, ctx)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const safeTool = String(call.tool).replace(/[\r\n]/g, '_')
    console.error(`[executor] Tool "${safeTool}" failed:`, err)
    return {
      success: false,
      message: `Could not complete "${call.tool}": ${detail}`,
      modified: 0,
    }
  }
}

/**
 * Execute a tool call that may be async (e.g., sandbox script execution).
 * Falls back to the synchronous `executeTool` for non-async tools.
 */
export async function executeToolAsync(call: ParsedToolCall, ctx: ExecutionContext): Promise<ExecutionResult> {
  const tool = resolveToolName(call.tool)

  if (tool === 'execute_script') {
    return executeScript(call, ctx)
  }

  // All other tools are synchronous
  return executeTool(call, ctx)
}

/** Execute an agent-generated script in the sandbox. */
async function executeScript(call: ParsedToolCall, ctx: ExecutionContext): Promise<ExecutionResult> {
  const params = call.params
  const code = String(params.code ?? '')
  if (!code.trim()) {
    return { success: false, message: 'execute_script requires code', modified: 0 }
  }

  const description = String(params.description ?? 'Script execution')
  ctx.pushHistory(description)

  try {
    const result = await runScript(code, {
      sheet: ctx.getActiveSheet(),
      getComputedValue: ctx.getComputedValue,
    })

    if (!result.success) {
      recordTelemetry('sandboxErrors', result.error)
      return { success: false, message: result.error, modified: 0 }
    }

    // Apply collected mutations
    const cellCount = Object.keys(result.cellUpdates).length
    if (cellCount > 0) {
      ctx.bulkSetCells(result.cellUpdates)
    }
    for (const [cellId, fmt] of Object.entries(result.formatUpdates)) {
      ctx.setCellFormat(cellId, fmt)
    }
    for (const row of result.rowDeletions) {
      ctx.deleteRow(row)
    }
    for (const afterRow of result.rowInsertions) {
      ctx.insertRow(afterRow)
    }

    const totalModified = cellCount + Object.keys(result.formatUpdates).length +
      result.rowDeletions.length + result.rowInsertions.length

    recordTelemetry('sandboxExecutions', `${totalModified} mutations in ${Math.round(result.executionTime)}ms`)

    return {
      success: true,
      message: result.summary || `Script executed: ${cellCount} cells modified`,
      modified: totalModified,
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    recordTelemetry('sandboxErrors', detail)
    return {
      success: false,
      message: `Script execution failed: ${detail}`,
      modified: 0,
    }
  }
}

/**
 * Dispatch a tool call to its registered handler.
 */
function executeToolInner(call: ParsedToolCall, ctx: ExecutionContext): ExecutionResult {
  const tool = resolveToolName(call.tool)
  const params = normalizeAliasParams(call.tool, call.params)
  const sheet = ctx.getActiveSheet()

  // Templates are built by the store's template handlers
  if (TEMPLATE_TOOL_NAMES.includes(tool)) {
    if (ctx.executeTemplate) return ctx.executeTemplate(tool, params)
    return { success: false, message: `Template "${tool}" is not available in this context`, modified: 0 }
  }

  const handler = TOOL_HANDLERS[tool]
  if (!handler) {
    return { success: false, message: `Unknown tool: ${tool}`, modified: 0 }
  }

  return handler(params, ctx, sheet)
}

/** Translate legacy alias params into their canonical form. */
function normalizeAliasParams(originalTool: string, params: Record<string, unknown>): Record<string, unknown> {
  if (originalTool === 'conditional_format') {
    const condition = String(params.condition ?? 'negative').toLowerCase()
    return {
      range: typeof params.column === 'string' ? params.column : undefined,
      condition: { operator: condition, value: params.value },
      bgColor: typeof params.color === 'string' ? params.color : '#FEE2E2',
    }
  }
  // format_range params are a subset of format_cells params — pass through
  return params
}
