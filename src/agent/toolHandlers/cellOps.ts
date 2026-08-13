/**
 * Cell-level tool handlers: set_cell, set_range, add_row, delete_row
 */
import { refToCell, cellToRef } from '@/engine/spreadsheet'
import { findLastDataRow } from '@/lib/sheetSort'
import { resolveDeleteRow } from '@/lib/deleteRowPreview'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, requireCellRef } from './types'

export const handleSetCell: ToolHandler = (params, ctx, _sheet) => {
  const cell = requireCellRef(params.cell, 'set_cell')
  if ('error' in cell) return cell.error

  const raw = params.value
  ctx.pushHistory(`Set ${cell.ref}`)

  if (typeof raw === 'number' || typeof raw === 'boolean') {
    ctx.setCellValue(cell.ref, raw)
    return { success: true, message: `Set ${cell.ref} to "${raw}"`, modified: 1 }
  }

  const value = String(raw ?? '')
  if (value.startsWith('=')) {
    ctx.setCellValue(cell.ref, null, value)
  } else {
    const num = parseFloat(value.replace(/[$,]/g, ''))
    ctx.setCellValue(cell.ref, !isNaN(num) && /^[$\d,.-]+$/.test(value) ? num : value)
  }
  return { success: true, message: `Set ${cell.ref} to "${value}"`, modified: 1 }
}

export const handleSetRange: ToolHandler = (params, ctx, _sheet) => {
  const start = requireCellRef(params.startCell, 'set_range')
  if ('error' in start) return start.error

  const values = params.values
  if (!Array.isArray(values)) {
    return { success: false, message: 'set_range requires a 2D "values" array', modified: 0 }
  }

  const ref = cellToRef(start.ref)
  ctx.pushHistory('Set range')

  const updates: BulkUpdates = {}
  for (let r = 0; r < values.length; r++) {
    const row = values[r]
    if (!Array.isArray(row)) continue
    for (let c = 0; c < row.length; c++) {
      const cellId = refToCell(ref.row + r, ref.col + c)
      const val = row[c]
      if (typeof val === 'string' && val.startsWith('=')) {
        updates[cellId] = { value: null, formula: val }
      } else {
        updates[cellId] = { value: (val ?? null) as string | number | boolean | null }
      }
    }
  }

  const count = applyBulk(ctx, updates)
  return { success: true, message: `Filled ${count} cells`, modified: count }
}

export const handleAddRow: ToolHandler = (params, ctx, sheet) => {
  const values = params.values
  if (!Array.isArray(values) || values.length === 0) {
    return { success: false, message: 'add_row requires a non-empty "values" array', modified: 0 }
  }

  const lastRow = findLastDataRow(sheet)
  const targetRow = (params.afterRow as number | undefined) ?? lastRow + 1
  ctx.pushHistory('Add row')

  const updates: BulkUpdates = {}
  for (let c = 0; c < values.length; c++) {
    const cellId = refToCell(targetRow, c)
    const val = values[c]
    if (typeof val === 'string' && val.startsWith('=')) {
      updates[cellId] = { value: null, formula: val }
    } else {
      updates[cellId] = { value: (val ?? null) as string | number | boolean | null }
    }
  }

  const count = applyBulk(ctx, updates)
  return { success: true, message: `Added row ${targetRow + 1} with ${count} values`, modified: count }
}

export const handleDeleteRow: ToolHandler = (params, ctx, sheet) => {
  const resolved = resolveDeleteRow(sheet, params, ctx.getComputedValue)
  if (!resolved) {
    if (typeof params.expectedRowSignature === 'string' && params.row != null) {
      const current = resolveDeleteRow(sheet, { row: params.row }, ctx.getComputedValue)
      if (current) {
        return {
          success: false,
          message: `Row ${params.row} changed after the preview. Nothing was deleted; please ask again to review the current row.`,
          modified: 0,
        }
      }
    }
    const target = params.row != null ? `row ${params.row}` : `a row containing "${String(params.match ?? '')}"`
    return { success: false, message: `Could not find ${target}`, modified: 0 }
  }

  ctx.pushHistory('Delete row')
  ctx.deleteRow(resolved.rowIndex)
  return { success: true, message: `Deleted row ${resolved.rowNumber}`, modified: 1 }
}
