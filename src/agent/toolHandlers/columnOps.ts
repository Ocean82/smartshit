/**
 * Column-level tool handlers: modify_column, rename_header, apply_formula
 */
import type { SheetData } from '@/types'
import { refToCell, cellToRef, letterToCol } from '@/engine/spreadsheet'
import { findHeaderRow } from '@/lib/sheetSort'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, requireColumn, findLastDataRowInCol, findFirstDataRowInCol } from './types'
import type { ExecutionContext } from '../executor'

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
    return applyFormulaToColumn(target, formula, sheet, ctx)
  }

  // Explicit cell reference
  if (/^[A-Z]{1,3}\d+$/.test(target)) {
    return applyFormulaToCell(target, formula, ctx)
  }

  return { success: false, message: `"${target}" is not a valid cell or column reference`, modified: 0 }
}

/** Apply a formula below the last data row in a column. */
function applyFormulaToColumn(
  colLetter: string,
  formula: string,
  sheet: SheetData,
  ctx: ExecutionContext,
) {
  const colIdx = letterToCol(colLetter)
  const lastRow = findLastDataRowInCol(sheet, colIdx)
  if (lastRow < 0) {
    return { success: false, message: `Column ${colLetter} has no data to summarise`, modified: 0 }
  }

  const headerRow = findHeaderRow(sheet)
  const firstDataRow = findFirstDataRowInCol(sheet, colIdx, headerRow)
  if (firstDataRow < 0 || firstDataRow > lastRow) {
    return { success: false, message: `Column ${colLetter} has no data to summarise`, modified: 0 }
  }

  const targetRow = lastRow + 1
  const cellId = refToCell(targetRow, colIdx)
  const fullFormula = formula.includes('(')
    ? formula
    : `${formula}(${colLetter}${firstDataRow + 1}:${colLetter}${lastRow + 1})`

  ctx.pushHistory('Apply formula')
  ctx.setCellValue(cellId, null, fullFormula)
  return { success: true, message: `Added ${formula} formula in ${cellId}`, modified: 1 }
}

/** Apply a formula directly to a named cell. */
function applyFormulaToCell(cellRef: string, formula: string, ctx: ExecutionContext) {
  ctx.pushHistory('Apply formula')
  ctx.setCellValue(cellRef, null, formula)
  return { success: true, message: `Set formula in ${cellRef}`, modified: 1 }
}
