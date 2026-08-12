/**
 * Shared types and utilities for tool handlers.
 */
import type { SheetData } from '@/types'
import type { ExecutionContext, ExecutionResult } from '../executor'
import { refToCell, cellToRef, letterToCol } from '@/engine/spreadsheet'
import { findHeaderRow } from '@/lib/sheetSort'

export type { ExecutionContext, ExecutionResult }

/** Params object from parsed tool call. */
export type ToolParams = Record<string, unknown>

/** Standard tool handler signature. */
export type ToolHandler = (
  params: ToolParams,
  ctx: ExecutionContext,
  sheet: SheetData,
) => ExecutionResult

/** Batched cell updates object. */
export type BulkUpdates = Record<string, { value: string | number | boolean | null; formula?: string }>

/**
 * Apply a batch of cell writes in a single store transaction.
 * Returns the number of cells written.
 */
export function applyBulk(ctx: ExecutionContext, updates: BulkUpdates): number {
  const count = Object.keys(updates).length
  if (count === 0) return 0
  if (ctx.bulkSetCells) {
    ctx.bulkSetCells(updates)
  } else {
    for (const [cellId, { value, formula }] of Object.entries(updates)) {
      ctx.setCellValue(cellId, value, formula)
    }
  }
  return count
}

/** Validate a cell-reference param, returning either the normalised ref or a failure result. */
export function requireCellRef(
  raw: unknown,
  toolName: string,
): { ref: string } | { error: ExecutionResult } {
  const ref = String(raw ?? '').trim().toUpperCase()
  if (!ref) {
    return { error: { success: false, message: `${toolName} requires a cell reference`, modified: 0 } }
  }
  if (!/^[A-Z]{1,3}\d{1,7}$/.test(ref)) {
    return { error: { success: false, message: `"${ref}" is not a valid cell reference`, modified: 0 } }
  }
  return { ref }
}

/**
 * Validate a column param, accepting either a letter ("B", "AA") or a header
 * name ("Amount"). Returns the resolved 0-based index plus a display label.
 */
export function requireColumn(
  raw: unknown,
  sheet: SheetData,
  ctx: ExecutionContext,
  toolName: string,
): { index: number; label: string } | { error: ExecutionResult } {
  const value = String(raw ?? '').trim()
  if (!value) {
    return { error: { success: false, message: `${toolName} requires a column`, modified: 0 } }
  }
  const index = resolveColumnIndex(value, sheet, ctx.getComputedValue)
  if (index == null || index < 0) {
    return { error: { success: false, message: `Could not find column "${value}"`, modified: 0 } }
  }
  return { index, label: /^[A-Z]{1,3}$/i.test(value) ? value.toUpperCase() : value }
}

/** Resolve a column given as a letter ("B") or a header name ("Amount"). */
export function resolveColumnIndex(
  column: string,
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
): number | null {
  const headerRow = findHeaderRow(sheet)
  let maxCol = -1
  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.col > maxCol) maxCol = ref.col
  }
  const lowered = column.toLowerCase().trim()
  // Header names win over short letter-like names such as Tax, ID, or Qty.
  for (let c = 0; c <= maxCol; c++) {
    if (getComputedValue(headerRow, c).toLowerCase().trim() === lowered) return c
  }
  if (/^[A-Z]{1,3}$/i.test(column)) {
    const index = letterToCol(column.toUpperCase())
    return index >= 0 && index < 1000 ? index : null
  }
  return null
}

/** Last populated row index in a column, or -1 when the column is empty. */
export function findLastDataRowInCol(sheet: SheetData, colIdx: number): number {
  let max = -1
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.value == null && !cell.formula) continue
    const ref = cellToRef(cellId)
    if (ref.col === colIdx && ref.row > max) max = ref.row
  }
  return max
}

/**
 * First populated row index in a column at or below `headerRow + 1`.
 */
export function findFirstDataRowInCol(sheet: SheetData, colIdx: number, headerRow: number): number {
  let min = -1
  for (const [cellId, cell] of Object.entries(sheet.cells)) {
    if (cell.value == null && !cell.formula) continue
    const ref = cellToRef(cellId)
    if (ref.col !== colIdx) continue
    if (ref.row <= headerRow && isHeaderLikeCell(cell.value)) continue
    if (min === -1 || ref.row < min) min = ref.row
  }
  return min
}

/** A cell that looks like a column heading (non-numeric text). */
export function isHeaderLikeCell(value: string | number | boolean | null | undefined): boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return false
  if (value == null) return false
  const text = String(value).trim()
  if (!text) return false
  return isNaN(parseFloat(text.replace(/[$,%]/g, '')))
}

/** Re-export cell utilities for handler convenience. */
export { refToCell, cellToRef, letterToCol }
