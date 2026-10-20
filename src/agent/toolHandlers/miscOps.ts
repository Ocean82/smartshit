/**
 * Miscellaneous tool handlers: filter, find_and_replace, export_data,
 * add_note, remove_note, set_checkbox, set_validation
 */
import type { FilterConfig, DataValidation } from '@/types'
import { refToCell, letterToCol } from '@/engine/spreadsheet'
import { escapeRegex } from '@/lib'
import { expandRange } from '@/lib/formatCellsTool'
import { getCellNotesService } from '@/lib/cellNotes'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, resolveColumnIndex } from './types'

/** Upper bound on dropdown options accepted from (untrusted) model output. */
const MAX_LIST_VALUES = 500

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

/**
 * Build a sanitized DataValidation from untrusted model params, or a sentinel
 * describing why the request is invalid / a clear request.
 *
 * Model output is untrusted: only fields defined on the DataValidation
 * interface are ever attached, unknown types are rejected, and numeric bounds
 * are normalized (min ≤ max). `sanitizeActionParams` is a blocklist that lets
 * forged extra keys through, so this handler is the real gate.
 */
function buildValidation(
  params: Record<string, unknown>,
): { kind: 'clear' } | { kind: 'set'; validation: DataValidation } | { kind: 'error'; message: string } {
  const rawType = String(params.type ?? '').trim().toLowerCase()
  const type = rawType === 'clear' ? 'none' : rawType

  if (type === 'none') return { kind: 'clear' }

  if (type === 'list') {
    const raw = Array.isArray(params.values) ? params.values : []
    const values = raw
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v))
      .filter((v) => v.trim() !== '')
      .slice(0, MAX_LIST_VALUES)
    if (values.length === 0) {
      return { kind: 'error', message: 'set_validation with type "list" requires a non-empty "values" array' }
    }
    const validation: DataValidation = { type: 'list', values }
    attachMessage(validation, params.message)
    return { kind: 'set', validation }
  }

  if (type === 'number' || type === 'text') {
    const validation: DataValidation = { type }
    let { min, max } = readBounds(params)
    if (min !== undefined && max !== undefined && min > max) {
      ;[min, max] = [max, min]
    }
    if (min !== undefined) validation.min = min
    if (max !== undefined) validation.max = max
    if (type === 'text') {
      const contains = typeof params.containsText === 'string' ? params.containsText : ''
      if (contains) validation.containsText = contains
    }
    attachMessage(validation, params.message)
    return { kind: 'set', validation }
  }

  if (type === 'date') {
    const validation: DataValidation = { type: 'date' }
    if (typeof params.dateMin === 'string' && params.dateMin.trim() !== '') validation.dateMin = params.dateMin
    if (typeof params.dateMax === 'string' && params.dateMax.trim() !== '') validation.dateMax = params.dateMax
    attachMessage(validation, params.message)
    return { kind: 'set', validation }
  }

  return { kind: 'error', message: `set_validation does not support type "${rawType}"` }
}

/** Read finite numeric min/max, ignoring non-numbers. */
function readBounds(params: Record<string, unknown>): { min?: number; max?: number } {
  const out: { min?: number; max?: number } = {}
  if (typeof params.min === 'number' && Number.isFinite(params.min)) out.min = params.min
  if (typeof params.max === 'number' && Number.isFinite(params.max)) out.max = params.max
  return out
}

/** Attach a non-empty string error message, never any other key. */
function attachMessage(validation: DataValidation, raw: unknown): void {
  if (typeof raw === 'string' && raw.trim() !== '') validation.message = raw
}

export const handleSetValidation: ToolHandler = (params, ctx, sheet) => {
  const range = String(params.range ?? '').trim()
  if (!range) {
    return { success: false, message: 'set_validation requires a "range"', modified: 0 }
  }

  const built = buildValidation(params)
  if (built.kind === 'error') {
    return { success: false, message: built.message, modified: 0 }
  }

  const cells = expandRange(range, sheet)
  if (cells == null) {
    return { success: false, message: `Could not parse range "${range}"`, modified: 0 }
  }

  ctx.pushHistory(built.kind === 'clear' ? 'Clear validation' : 'Set validation')

  let count = 0
  for (const cellId of cells) {
    ctx.setCellValidation?.(cellId, built.kind === 'clear' ? null : built.validation)
    count++
  }

  const verb = built.kind === 'clear' ? 'Cleared validation on' : 'Set validation on'
  return { success: true, message: `${verb} ${count} cell(s)`, modified: count }
}
