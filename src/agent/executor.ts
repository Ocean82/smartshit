/**
 * Agent Executor — runs parsed tool calls against the spreadsheet store.
 * This is the "Kiro for spreadsheets" execution engine.
 * 
 * Flow: User message → Parser → Executor → Store mutations → Response
 */

import type { ParsedToolCall } from './parser'
import { refToCell, cellToRef, letterToCol } from '@/engine/spreadsheet'
import type { SheetData, FilterConfig, CellFormat, ChartConfig } from '@/types'
import { computeSortedCellUpdates, findHeaderRow, findLastDataRow, type SortPatch } from '@/lib/sheetSort'
import { applyFormatCells } from '@/lib/formatCellsTool'
import { resolveToolName, TEMPLATE_TOOL_NAMES } from '@shared/toolRegistry'

export interface ExecutionContext {
  getActiveSheet: () => SheetData
  getComputedValue: (row: number, col: number) => string
  setCellValue: (cellId: string, value: string | number | boolean | null, formula?: string) => void
  setCellFormat: (cellId: string, format: Partial<CellFormat>) => void
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
}

export interface ExecutionResult {
  success: boolean
  message: string
  modified: number  // Number of cells affected
}

/**
 * Execute a single tool call against the spreadsheet.
 */
export function executeTool(call: ParsedToolCall, ctx: ExecutionContext): ExecutionResult {
  const tool = resolveToolName(call.tool)
  const params = normalizeAliasParams(call.tool, call.params)
  const sheet = ctx.getActiveSheet()

  // Templates are built by the store's template handlers
  if (TEMPLATE_TOOL_NAMES.includes(tool)) {
    if (ctx.executeTemplate) return ctx.executeTemplate(tool, params)
    return { success: false, message: `Template "${tool}" is not available in this context`, modified: 0 }
  }

  switch (tool) {
    case 'set_cell': {
      const cell = (params.cell as string).toUpperCase()
      const value = params.value as string
      ctx.pushHistory(`Set ${cell}`)
      if (value.startsWith('=')) {
        ctx.setCellValue(cell, null, value)
      } else {
        const num = parseFloat(value.replace(/[$,]/g, ''))
        ctx.setCellValue(cell, !isNaN(num) && /^[\$\d,.-]+$/.test(value) ? num : value)
      }
      return { success: true, message: `Set ${cell} to "${value}"`, modified: 1 }
    }

    case 'set_range': {
      const startCell = (params.startCell as string).toUpperCase()
      const values = params.values as unknown[][]
      const ref = cellToRef(startCell)
      ctx.pushHistory('Set range')
      let count = 0
      for (let r = 0; r < values.length; r++) {
        const row = values[r]
        if (!Array.isArray(row)) continue
        for (let c = 0; c < row.length; c++) {
          const cellId = refToCell(ref.row + r, ref.col + c)
          const val = row[c]
          if (typeof val === 'string' && val.startsWith('=')) {
            ctx.setCellValue(cellId, null, val)
          } else {
            ctx.setCellValue(cellId, val as string | number | null)
          }
          count++
        }
      }
      return { success: true, message: `Filled ${count} cells`, modified: count }
    }

    case 'add_row': {
      const values = params.values as (string | number)[]
      const lastRow = findLastDataRow(sheet)
      const targetRow = (params.afterRow as number | undefined) ?? lastRow + 1
      ctx.pushHistory('Add row')
      let count = 0
      for (let c = 0; c < values.length; c++) {
        const cellId = refToCell(targetRow, c)
        const val = values[c]
        if (typeof val === 'string' && val.startsWith('=')) {
          ctx.setCellValue(cellId, null, val)
        } else {
          ctx.setCellValue(cellId, val)
        }
        count++
      }
      return { success: true, message: `Added row ${targetRow + 1} with ${count} values`, modified: count }
    }

    case 'delete_row': {
      if (params.row != null) {
        const row = (params.row as number) - 1 // Convert 1-indexed to 0-indexed
        ctx.pushHistory(`Delete row ${params.row}`)
        ctx.deleteRow(row)
        return { success: true, message: `Deleted row ${params.row}`, modified: 1 }
      }
      if (params.match) {
        const matchText = (params.match as string).toLowerCase()
        const row = findRowByContent(sheet, matchText)
        if (row >= 0) {
          ctx.pushHistory(`Delete row containing "${params.match}"`)
          ctx.deleteRow(row)
          return { success: true, message: `Deleted row containing "${params.match}"`, modified: 1 }
        }
        return { success: false, message: `Could not find a row containing "${params.match}"`, modified: 0 }
      }
      return { success: false, message: 'No row specified', modified: 0 }
    }

    case 'rename_header': {
      const col = (params.column as string).toUpperCase()
      const newName = params.newName as string
      const colIdx = col.charCodeAt(0) - 65
      // Find the header row (usually row 0 or first row with content)
      const headerRow = findHeaderRow(sheet)
      const cellId = refToCell(headerRow, colIdx)
      ctx.pushHistory(`Rename column ${col}`)
      ctx.setCellValue(cellId, newName)
      return { success: true, message: `Renamed column ${col} to "${newName}"`, modified: 1 }
    }

    case 'apply_formula': {
      // Accept legacy {column} param alongside canonical {cell}
      const target = String((params.cell ?? params.column ?? '') as string).toUpperCase()
      if (!target) return { success: false, message: 'No target cell or column specified', modified: 0 }
      let formula = String(params.formula ?? '=SUM')
      if (!formula.startsWith('=')) formula = `=${formula}`
      ctx.pushHistory(`Apply formula`)

      // If target is a single column letter (e.g., "B"), put formula at bottom
      if (target.length === 1 && /^[A-Z]$/.test(target)) {
        const colIdx = target.charCodeAt(0) - 65
        const lastRow = findLastDataRowInCol(sheet, colIdx)
        const targetRow = lastRow + 1
        const cellId = refToCell(targetRow, colIdx)
        // Build full formula if just function name
        const fullFormula = formula.includes('(')
          ? formula
          : `${formula}(${target}2:${target}${lastRow + 1})`
        ctx.setCellValue(cellId, null, fullFormula)
        return { success: true, message: `Added ${formula} formula in ${cellId}`, modified: 1 }
      }

      // Otherwise target is a cell reference
      ctx.setCellValue(target, null, formula)
      return { success: true, message: `Set formula in ${target}`, modified: 1 }
    }

    case 'modify_column': {
      const col = (params.column as string).toUpperCase()
      const operation = params.operation as string
      const factor = params.factor as number
      if (typeof factor !== 'number' || !Number.isFinite(factor)) {
        return { success: false, message: 'modify_column needs a numeric factor', modified: 0 }
      }
      const colIdx = col.charCodeAt(0) - 65
      ctx.pushHistory(`Modify column ${col}`)

      let count = 0
      for (const [cellId, cell] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId)
        if (ref.col !== colIdx) continue
        const computed = ctx.getComputedValue(ref.row, ref.col)
        const num = parseFloat(computed)
        if (isNaN(num)) continue

        let newVal: number
        switch (operation) {
          case 'multiply': newVal = num * factor; break
          case 'add': newVal = num + factor; break
          case 'subtract': newVal = num - factor; break
          case 'divide': newVal = factor !== 0 ? num / factor : num; break
          default: newVal = num
        }
        ctx.setCellValue(cellId, Math.round(newVal * 100) / 100)
        count++
      }
      return { success: true, message: `Modified ${count} cells in column ${col}`, modified: count }
    }

    case 'sort_sheet': {
      const col = (params.column as string).toUpperCase()
      const direction = ((params.direction as string) || 'asc') === 'desc' ? 'desc' : 'asc'
      const colIdx = col.charCodeAt(0) - 65
      ctx.pushHistory(`Sort by column ${col}`)

      const patch = computeSortedCellUpdates(sheet, colIdx, direction, ctx.getComputedValue)
      ctx.applySortPatch(patch)
      const count = Object.keys(patch.writes).length + patch.deletes.length

      return { success: true, message: `Sorted rows by column ${col} (${direction})`, modified: count }
    }

    case 'format_cells': {
      return applyFormatCells(params, ctx)
    }

    case 'filter': {
      const rawColumn = String(params.column ?? '').trim()
      const colIdx = resolveColumnIndex(rawColumn, sheet, ctx.getComputedValue)
      if (colIdx == null) {
        return { success: false, message: `Could not find column "${rawColumn}"`, modified: 0 }
      }
      const condition = String(params.condition ?? 'equals').toLowerCase()
      if (condition === 'not_empty') {
        // Approximate not_empty: keep rows whose cell contains anything
        ctx.setFilters([{ column: colIdx, condition: 'contains', value: '' }])
      } else {
        const mapped = condition === 'eq' ? 'equals' : condition
        ctx.setFilters([{ column: colIdx, condition: mapped, value: params.value as string | number }])
      }
      return { success: true, message: `Filtered rows by column ${rawColumn.toUpperCase()} (${condition})`, modified: 0 }
    }

    case 'clear_sheet': {
      ctx.pushHistory('Clear sheet')
      const cellIds = Object.keys(sheet.cells)
      for (const cellId of cellIds) {
        ctx.setCellValue(cellId, null)
      }
      return { success: true, message: 'Sheet cleared', modified: cellIds.length }
    }

    case 'rename_sheet': {
      const name = params.name as string
      ctx.renameSheet(sheet.id, name)
      return { success: true, message: `Sheet renamed to "${name}"`, modified: 0 }
    }

    case 'find_and_replace': {
      const find = (params.find as string).toLowerCase()
      const replace = params.replace as string
      ctx.pushHistory(`Replace "${find}" → "${replace}"`)
      let count = 0
      for (const [cellId, cell] of Object.entries(sheet.cells)) {
        if (cell.value != null && String(cell.value).toLowerCase().includes(find)) {
          const newVal = String(cell.value).replace(new RegExp(find, 'gi'), replace)
          ctx.setCellValue(cellId, newVal)
          count++
        }
      }
      return { success: true, message: `Replaced ${count} occurrence(s)`, modified: count }
    }

    case 'find_max':
    case 'find_min': {
      const col = (params.column as string).toUpperCase()
      const colIdx = col.charCodeAt(0) - 65
      const isMax = tool === 'find_max'
      let best: { val: number; row: number; label: string } | null = null

      for (const [cellId] of Object.entries(sheet.cells)) {
        const ref = cellToRef(cellId)
        if (ref.col !== colIdx) continue
        const computed = ctx.getComputedValue(ref.row, ref.col)
        const num = parseFloat(computed.replace(/[$,]/g, ''))
        if (isNaN(num)) continue
        if (!best || (isMax ? num > best.val : num < best.val)) {
          const label = ctx.getComputedValue(ref.row, 0) || `Row ${ref.row + 1}`
          best = { val: num, row: ref.row, label }
        }
      }

      if (best) {
        const desc = isMax ? 'highest' : 'lowest'
        return { success: true, message: `The ${desc} value in column ${col} is $${best.val.toLocaleString()} (${best.label}, row ${best.row + 1})`, modified: 0 }
      }
      return { success: false, message: `No numeric values found in column ${col}`, modified: 0 }
    }

    default:
      return { success: false, message: `Unknown tool: ${tool}`, modified: 0 }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Translate legacy alias params (format_range passthrough, conditional_format column/color) into format_cells params. */
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

/** Resolve a column given as a letter ("B") or a header name ("Amount"). */
function resolveColumnIndex(
  column: string,
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): number | null {
  if (/^[A-Z]{1,3}$/i.test(column)) return letterToCol(column.toUpperCase())
  const headerRow = findHeaderRow(sheet)
  const lowered = column.toLowerCase()
  for (let c = 0; c < 60; c++) {
    if (getComputedValue(headerRow, c).toLowerCase() === lowered) return c
  }
  return null
}

function findLastDataRowInCol(sheet: SheetData, colIdx: number): number {
  let max = 0
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.col === colIdx && ref.row > max) max = ref.row
  }
  return max
}

function findRowByContent(sheet: SheetData, text: string): number {
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.value != null && String(cell.value).toLowerCase().includes(text)) {
      return cellToRef(cellId).row
    }
  }
  return -1
}

