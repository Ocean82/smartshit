/**
 * Column-level tool handlers: modify_column, rename_header, apply_formula
 */
import type { SheetData } from '@/types'
import { refToCell, cellToRef, letterToCol } from '@/engine/spreadsheet'
import { findHeaderRow } from '@/lib/sheetSort'
import { getColumnDataRows } from '@/lib/sheetRows'
import { extractRangeRefs } from '@/auditor/utils'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, requireColumn } from './types'
import type { ExecutionContext, ExecutionResult } from '../executor'

const AGGREGATE_PATTERN = /\b(SUM|AVERAGE|COUNT|COUNTA|MIN|MAX|SUBTOTAL)\b/i

export const handleRenameHeader: ToolHandler = (params, ctx, sheet) => {
  const col = requireColumn(params.column, sheet, ctx, 'rename_header')
  if ('error' in col) return col.error

  const newName = String(params.newName ?? '').trim()
  if (!newName) {
    return { success: false, message: 'rename_header requires a "newName"', modified: 0 }
  }

  const headerRow = findHeaderRow(sheet)
  const cellId = refToCell(headerRow, col.index)
  ctx.pushHistory(`Rename column ${col.label}`)
  ctx.setCellValue(cellId, newName)
  return { success: true, message: `Renamed column ${col.label} to "${newName}"`, modified: 1 }
}

export const handleModifyColumn: ToolHandler = (params, ctx, sheet) => {
  const col = requireColumn(params.column, sheet, ctx, 'modify_column')
  if ('error' in col) return col.error

  const operation = String(params.operation ?? 'multiply')
  const factor = params.factor
  if (typeof factor !== 'number' || !Number.isFinite(factor)) {
    return { success: false, message: 'modify_column needs a numeric factor', modified: 0 }
  }
  if (!['multiply', 'add', 'subtract', 'divide'].includes(operation)) {
    return { success: false, message: `Unsupported operation "${operation}"`, modified: 0 }
  }
  if (operation === 'divide' && factor === 0) {
    return { success: false, message: 'Cannot divide by zero', modified: 0 }
  }

  ctx.pushHistory(`Modify column ${col.label}`)
  const updates: BulkUpdates = {}

  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.col !== col.index) continue
    const computed = ctx.getComputedValue(ref.row, ref.col)
    const num = parseFloat(computed.replace(/[$,]/g, ''))
    if (isNaN(num)) continue

    let newVal: number
    switch (operation) {
      case 'multiply': newVal = num * factor; break
      case 'add': newVal = num + factor; break
      case 'subtract': newVal = num - factor; break
      case 'divide': newVal = num / factor; break
      default: newVal = num
    }
    updates[cellId] = { value: Math.round(newVal * 100) / 100 }
  }

  const count = applyBulk(ctx, updates)
  return { success: true, message: `Modified ${count} cells in column ${col.label}`, modified: count }
}

export const handleApplyFormula: ToolHandler = (params, ctx, sheet) => {
  // Accept legacy {column} param alongside canonical {cell}
  const target = String((params.cell ?? params.column ?? '')).trim().toUpperCase()
  if (!target) return { success: false, message: 'No target cell or column specified', modified: 0 }

  let formula = String(params.formula ?? '=SUM')
  if (!formula.startsWith('=')) formula = `=${formula}`

  // Bare column letter — place formula below last populated cell
  if (/^[A-Z]{1,3}$/.test(target)) {
    return applyFormulaToColumn(target, formula, sheet, ctx, params)
  }

  // Explicit cell reference
  if (/^[A-Z]{1,3}\d+$/.test(target)) {
    return applyFormulaToCell(target, formula, sheet, ctx, params)
  }

  return { success: false, message: `"${target}" is not a valid cell or column reference`, modified: 0 }
}

/**
 * Detect classic auditor "range gap" risk: an aggregate range that excludes an
 * immediately adjacent numeric cell. Returns a human-readable warning or null.
 */
export function detectApplyFormulaRangeGapRisk(
  formula: string,
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
  formulaCellId?: string,
): string | null {
  if (!AGGREGATE_PATTERN.test(formula)) return null
  const ranges = extractRangeRefs(formula.replace(/^=/, ''))
  const formulaRef = formulaCellId ? cellToRef(formulaCellId) : null

  for (const { range, start, end } of ranges) {
    const startRef = cellToRef(start)
    const endRef = cellToRef(end)
    if (startRef.col === endRef.col) {
      const col = startRef.col
      const minRow = Math.min(startRef.row, endRef.row)
      const maxRow = Math.max(startRef.row, endRef.row)
      if (minRow > 0) {
        const aboveId = refToCell(minRow - 1, col)
        if (!formulaRef || aboveId !== formulaCellId) {
          const num = parseNumericCell(sheet, aboveId, minRow - 1, col, getComputedValue)
          if (num != null) {
            return `Range ${range} excludes adjacent ${aboveId} (${num}). Extend the range or pass confirmGaps=true to apply anyway.`
          }
        }
      }
      const belowId = refToCell(maxRow + 1, col)
      if (!formulaRef || belowId !== formulaCellId) {
        const num = parseNumericCell(sheet, belowId, maxRow + 1, col, getComputedValue)
        if (num != null) {
          return `Range ${range} excludes adjacent ${belowId} (${num}). Extend the range or pass confirmGaps=true to apply anyway.`
        }
      }
    }
    if (startRef.row === endRef.row) {
      const row = startRef.row
      const minCol = Math.min(startRef.col, endRef.col)
      const maxCol = Math.max(startRef.col, endRef.col)
      if (minCol > 0) {
        const leftId = refToCell(row, minCol - 1)
        if (!formulaRef || leftId !== formulaCellId) {
          const num = parseNumericCell(sheet, leftId, row, minCol - 1, getComputedValue)
          if (num != null) {
            return `Range ${range} excludes adjacent ${leftId} (${num}). Extend the range or pass confirmGaps=true to apply anyway.`
          }
        }
      }
      const rightId = refToCell(row, maxCol + 1)
      if (!formulaRef || rightId !== formulaCellId) {
        const num = parseNumericCell(sheet, rightId, row, maxCol + 1, getComputedValue)
        if (num != null) {
          return `Range ${range} excludes adjacent ${rightId} (${num}). Extend the range or pass confirmGaps=true to apply anyway.`
        }
      }
    }
  }
  return null
}

function parseNumericCell(
  sheet: SheetData,
  cellId: string,
  row: number,
  col: number,
  getComputedValue: (row: number, col: number) => string,
): number | null {
  const cell = sheet.cells[cellId]
  if (!cell && !getComputedValue(row, col)) return null
  const raw = cell?.value
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const computed = getComputedValue(row, col).replace(/[$,]/g, '')
  const num = parseFloat(computed)
  return Number.isFinite(num) && computed.trim() !== '' ? num : null
}

function confirmGapsRequested(params: Record<string, unknown>): boolean {
  return params.confirmGaps === true || params.confirmGaps === 'true' || params.force === true
}

/** Apply a formula below the last data row in a column. */
function applyFormulaToColumn(
  colLetter: string,
  formula: string,
  sheet: SheetData,
  ctx: ExecutionContext,
  params: Record<string, unknown>,
): ExecutionResult {
  const colIdx = letterToCol(colLetter)

  // Use unified row bounds that exclude summary rows
  const bounds = getColumnDataRows(sheet, colIdx, ctx.getComputedValue)
  if (!bounds) {
    return { success: false, message: `Column ${colLetter} has no data to summarise`, modified: 0 }
  }

  const targetRow = bounds.lastRow + 1
  const cellId = refToCell(targetRow, colIdx)
  const fullFormula = formula.includes('(')
    ? formula
    : `${formula}(${colLetter}${bounds.firstRow + 1}:${colLetter}${bounds.lastRow + 1})`

  const gapRisk = detectApplyFormulaRangeGapRisk(fullFormula, sheet, ctx.getComputedValue, cellId)
  if (gapRisk && !confirmGapsRequested(params)) {
    return {
      success: false,
      message: `Blocked apply_formula (range gap risk): ${gapRisk}`,
      modified: 0,
    }
  }

  ctx.pushHistory('Apply formula')
  ctx.setCellValue(cellId, null, fullFormula)
  const warn = gapRisk ? ` Warning: ${gapRisk}` : ''
  return { success: true, message: `Added ${fullFormula} formula in ${cellId}.${warn}`, modified: 1 }
}

/** Apply a formula directly to a named cell. */
function applyFormulaToCell(
  cellRef: string,
  formula: string,
  sheet: SheetData,
  ctx: ExecutionContext,
  params: Record<string, unknown>,
): ExecutionResult {
  const gapRisk = detectApplyFormulaRangeGapRisk(formula, sheet, ctx.getComputedValue, cellRef)
  if (gapRisk && !confirmGapsRequested(params)) {
    return {
      success: false,
      message: `Blocked apply_formula (range gap risk): ${gapRisk}`,
      modified: 0,
    }
  }

  ctx.pushHistory('Apply formula')
  ctx.setCellValue(cellRef, null, formula)
  const warn = gapRisk ? ` Warning: ${gapRisk}` : ''
  return { success: true, message: `Set formula in ${cellRef}.${warn}`, modified: 1 }
}
