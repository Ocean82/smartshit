/**
 * Miscellaneous tool handlers: filter, find_and_replace, export_data,
 * add_note, remove_note, set_checkbox
 */
import type { SheetData, FilterConfig } from '@/types'
import { refToCell, letterToCol } from '@/engine/spreadsheet'
import { escapeRegex } from '@/lib'
import { getCellNotesService } from '@/lib/cellNotes'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, resolveColumnIndex } from './types'

export const handleFilter: ToolHandler = (params, ctx, sheet) => {
  const rawColumn = String(params.column ?? '').trim()
  const colIdx = resolveColumnIndex(rawColumn, sheet, ctx.getComputedValue)
  if (colIdx == null) {
    return { success: false, message: `Could not find column "${rawColumn}"`, modified: 0 }
  }

  const condition = String(params.condition ?? 'equals').toLowerCase()
  if (condition === 'not_empty') {
    ctx.setFilters([{ column: colIdx, condition: 'isNotEmpty' }])
  } else {
    const mapped = condition === 'eq' ? 'equals' : condition
    ctx.setFilters([{ column: colIdx, condition: mapped as FilterConfig['condition'], value: params.value as string | number }])
  }
  return { success: true, message: `Filtered rows by column ${rawColumn.toUpperCase()} (${condition})`, modified: 0 }
}

export const handleFindAndReplace: ToolHandler = (params, ctx, sheet) => {
  const find = String(params.find ?? '')
  const replace = String(params.replace ?? '')
  if (!find) {
    return { success: false, message: 'find_and_replace requires a "find" value', modified: 0 }
  }

  const pattern = new RegExp(escapeRegex(find), 'gi')
  ctx.pushHistory(`Replace "${find}" → "${replace}"`)

  const updates: BulkUpdates = {}
  let skippedFormulas = 0

  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.formula) {
      if (cell.value != null && String(cell.value).toLowerCase().includes(find.toLowerCase())) {
        skippedFormulas++
      }
      continue
    }
    if (cell.value == null) continue
    const original = String(cell.value)
    pattern.lastIndex = 0
    const next = original.replace(pattern, () => replace)
    if (next !== original) updates[cellId] = { value: next }
  }

  const count = applyBulk(ctx, updates)
  const note = skippedFormulas > 0
    ? ` (skipped ${skippedFormulas} formula cell${skippedFormulas === 1 ? '' : 's'})`
    : ''
  return { success: true, message: `Replaced in ${count} cell(s)${note}`, modified: count }
}

export const handleExportData: ToolHandler = (params, ctx, _sheet) => {
  const format = String(params.format ?? '').toLowerCase()
  if (!['csv', 'xlsx', 'json'].includes(format)) {
    return { success: false, message: 'Export format must be CSV, XLSX, or JSON', modified: 0 }
  }
  if (!ctx.exportData) {
    return { success: false, message: 'Export is not available in this context', modified: 0 }
  }
  ctx.exportData(format as 'csv' | 'xlsx' | 'json')
  return { success: true, message: `Started the ${format.toUpperCase()} download`, modified: 0 }
}

export const handleAddNote: ToolHandler = (params, _ctx, sheet) => {
  const cell = String(params.cell ?? '').toUpperCase()
  const text = String(params.text ?? '')
  if (!cell || !text) return { success: false, message: 'add_note requires cell and text', modified: 0 }
  getCellNotesService().setNote(sheet.id, cell, text)
  return { success: true, message: `Added note to ${cell}`, modified: 0 }
}

export const handleRemoveNote: ToolHandler = (params, _ctx, sheet) => {
  const cell = String(params.cell ?? '').toUpperCase()
  if (!cell) return { success: false, message: 'remove_note requires cell', modified: 0 }
  getCellNotesService().removeNote(sheet.id, cell)
  return { success: true, message: `Removed note from ${cell}`, modified: 0 }
}

export const handleSetCheckbox: ToolHandler = (params, ctx, _sheet) => {
  const cellParam = String(params.cell ?? '').toUpperCase()
  const checked = params.checked === true
  if (!cellParam) return { success: false, message: 'set_checkbox requires cell', modified: 0 }

  ctx.pushHistory('Set checkbox')
  const checkboxValidation = { type: 'checkbox' as const, checkedValue: 'TRUE', uncheckedValue: 'FALSE' }

  // Handle ranges like "C2:C10"
  const rangeMatch = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(cellParam)
  let count = 0

  if (rangeMatch) {
    const startCol = letterToCol(rangeMatch[1])
    const startRow = parseInt(rangeMatch[2]) - 1
    const endCol = letterToCol(rangeMatch[3])
    const endRow = parseInt(rangeMatch[4]) - 1
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const id = refToCell(r, c)
        ctx.setCellValue(id, checked ? 'TRUE' : 'FALSE')
        ctx.setCellValidation?.(id, checkboxValidation)
        count++
      }
    }
  } else {
    ctx.setCellValue(cellParam, checked ? 'TRUE' : 'FALSE')
    ctx.setCellValidation?.(cellParam, checkboxValidation)
    count = 1
  }

  return { success: true, message: `Set ${count} checkbox cell(s)`, modified: count }
}
