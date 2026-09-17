/**
 * Column-width helpers. Sparse map on `sheet.columnWidths` (xlsx `!cols`).
 * Shift math lives in rowLayout (`shiftSparseMapOn*`) — same shape as rowHeights.
 */

import { DEFAULT_CELL_WIDTH } from '@/lib/layoutConstants'

/** Minimum pixel width a column can be resized to. */
export const MIN_COL_WIDTH = 40

/** Maximum pixel width a column can be resized to. */
export const MAX_COL_WIDTH = 400

export function getColWidth(columnWidths: Record<number, number>, col: number): number {
  const override = columnWidths[col]
  if (typeof override === 'number' && override > 0) return Math.round(override)
  return DEFAULT_CELL_WIDTH
}

export function clampColWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_CELL_WIDTH
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, Math.round(width)))
}

export function setColAt(columnWidths: Record<number, number>, col: number, width: number): Record<number, number> {
  const next = { ...columnWidths }
  next[col] = clampColWidth(width)
  return next
}
