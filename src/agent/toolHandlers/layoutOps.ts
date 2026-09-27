/**
 * Layout tool handlers: set_column_width, set_row_height, auto_fit.
 *
 * These delegate to ExecutionContext layout hooks (setColumnWidth / setRowHeight
 * / autoFitRows), which mutate without pushing history. The single undo point is
 * owned by the handler's ctx.pushHistory (active in the fast/parser path,
 * suppressed in the LLM Apply path where applyAction already pushed one).
 */
import type { SheetData } from '@/types'
import { letterToCol, cellToRef } from '@/engine/spreadsheet'
import type { ToolHandler, ToolParams } from './types'

/** Parse a columns spec into 0-based indices: "B", "B:D", "B,D,F", or a number. */
export function parseColumns(raw: unknown): number[] {
  const out = new Set<number>()
  const add = (idx: number) => { if (idx >= 0 && idx < 16384) out.add(idx) }

  const each = (token: string) => {
    const t = token.trim().toUpperCase()
    if (!t) return
    const range = t.match(/^([A-Z]{1,3}):([A-Z]{1,3})$/)
    if (range) {
      const a = letterToCol(range[1])
      const b = letterToCol(range[2])
      for (let c = Math.min(a, b); c <= Math.max(a, b); c++) add(c)
      return
    }
    if (/^[A-Z]{1,3}$/.test(t)) { add(letterToCol(t)); return }
    if (/^\d+$/.test(t)) add(parseInt(t, 10)) // 0-based numeric column
  }

  if (Array.isArray(raw)) raw.forEach((r) => each(String(r)))
  else if (typeof raw === 'number') add(raw)
  else if (typeof raw === 'string') raw.split(',').forEach(each)
  return [...out].sort((a, b) => a - b)
}

/** Parse a rows spec into 0-based indices. Accepts 1-based user rows: "2", "2:5", "2,4". */
export function parseRows(raw: unknown): number[] {
  const out = new Set<number>()
  const add = (idx: number) => { if (idx >= 0 && idx < 1048576) out.add(idx) }

  const each = (token: string) => {
    const t = token.trim()
    if (!t) return
    const range = t.match(/^(\d+):(\d+)$/)
    if (range) {
      const a = parseInt(range[1], 10) - 1
      const b = parseInt(range[2], 10) - 1
      for (let r = Math.min(a, b); r <= Math.max(a, b); r++) add(r)
      return
    }
    if (/^\d+$/.test(t)) add(parseInt(t, 10) - 1)
  }

  if (Array.isArray(raw)) raw.forEach((r) => each(String(r)))
  else if (typeof raw === 'number') add(raw - 1)
  else if (typeof raw === 'string') raw.split(',').forEach(each)
  return [...out].sort((a, b) => a - b)
}

/** All row indices that contain at least one populated cell. */
function populatedRows(sheet: SheetData): number[] {
  const rows = new Set<number>()
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.value == null && !cell.formula) continue
    rows.add(cellToRef(cellId).row)
  }
  return [...rows].sort((a, b) => a - b)
}

function colLabel(idx: number): string {
  let n = idx, s = ''
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

export const handleSetColumnWidth: ToolHandler = (params: ToolParams, ctx) => {
  if (!ctx.setColumnWidth) {
    return { success: false, message: 'Column width changes are not available here', modified: 0 }
  }
  const cols = parseColumns(params.column ?? params.columns ?? params.range)
  const width = Number(params.width ?? params.value)
  if (cols.length === 0) {
    return { success: false, message: 'set_column_width needs a column (e.g. "B" or "B:D")', modified: 0 }
  }
  if (!Number.isFinite(width)) {
    return { success: false, message: 'set_column_width needs a numeric width in pixels', modified: 0 }
  }
  ctx.pushHistory(cols.length === 1 ? 'Column width' : 'Column widths')
  for (const c of cols) ctx.setColumnWidth(c, width)
  const label = cols.length === 1 ? colLabel(cols[0]) : `${cols.length} columns`
  return { success: true, message: `Set width of ${label} to ${Math.round(width)}px`, modified: cols.length }
}

export const handleSetRowHeight: ToolHandler = (params: ToolParams, ctx) => {
  if (!ctx.setRowHeight) {
    return { success: false, message: 'Row height changes are not available here', modified: 0 }
  }
  const rows = parseRows(params.row ?? params.rows ?? params.range)
  const height = Number(params.height ?? params.value)
  if (rows.length === 0) {
    return { success: false, message: 'set_row_height needs a row (e.g. "2" or "2:5")', modified: 0 }
  }
  if (!Number.isFinite(height)) {
    return { success: false, message: 'set_row_height needs a numeric height in pixels', modified: 0 }
  }
  ctx.pushHistory(rows.length === 1 ? 'Row height' : 'Row heights')
  for (const r of rows) ctx.setRowHeight(r, height)
  const label = rows.length === 1 ? `row ${rows[0] + 1}` : `${rows.length} rows`
  return { success: true, message: `Set height of ${label} to ${Math.round(height)}px`, modified: rows.length }
}

export const handleAutoFit: ToolHandler = (params: ToolParams, ctx, sheet) => {
  if (!ctx.autoFitRows) {
    return { success: false, message: 'Auto-fit is not available here', modified: 0 }
  }
  const rows = parseRows(params.row ?? params.rows ?? params.range)
  const target = rows.length > 0 ? rows : populatedRows(sheet)
  if (target.length === 0) {
    return { success: false, message: 'Nothing to auto-fit — the sheet is empty', modified: 0 }
  }
  ctx.pushHistory(target.length === 1 ? 'Autofit row height' : 'Autofit row heights')
  const changed = ctx.autoFitRows(target)
  if (changed === 0) {
    return { success: false, message: 'No rows needed resizing (no wrapped content).', modified: 0 }
  }
  return { success: true, message: `Auto-fit ${changed} row${changed === 1 ? '' : 's'} to content`, modified: changed }
}
