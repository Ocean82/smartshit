/**
 * Selection utilities — typed helpers for single and multi-range selection.
 *
 * Inspired by react-spreadsheet's polymorphic Selection model, adapted for
 * SmartSht's Zustand-based flat state. The existing `Selection` interface
 * (`{startRow, startCol, endRow, endCol}`) remains the primary range; these
 * utilities add multi-range awareness on top.
 */

import type { Selection } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SelectionRange {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/** Full selection state supporting multiple disjoint ranges (Ctrl+click). */
export interface MultiSelectionState {
  /** The primary (most recent) range — always present when anything is selected. */
  primary: SelectionRange
  /** Additional ranges from Ctrl+click. */
  additional: SelectionRange[]
}

// ─── Normalization ──────────────────────────────────────────────────────────

/** Normalize a range so start ≤ end for both axes. */
export function normalizeRange(range: SelectionRange): SelectionRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  }
}

// ─── Point-in-selection checks ──────────────────────────────────────────────

/** Is a cell within a single range? */
export function isInRange(row: number, col: number, range: SelectionRange): boolean {
  const { startRow, startCol, endRow, endCol } = normalizeRange(range)
  return row >= startRow && row <= endRow && col >= startCol && col <= endCol
}

/** Is a cell within any of the selection ranges (primary + additional)? */
export function isInMultiSelection(row: number, col: number, state: MultiSelectionState): boolean {
  if (isInRange(row, col, state.primary)) return true
  return state.additional.some((r) => isInRange(row, col, r))
}

// ─── Entire row/column detection ────────────────────────────────────────────

/** Does this range cover the full row width? */
export function isEntireRow(range: SelectionRange, maxCol: number): boolean {
  const norm = normalizeRange(range)
  return norm.startCol === 0 && norm.endCol >= maxCol - 1
}

/** Does this range cover the full column height? */
export function isEntireColumn(range: SelectionRange, maxRow: number): boolean {
  const norm = normalizeRange(range)
  return norm.startRow === 0 && norm.endRow >= maxRow - 1
}

// ─── Size and cell enumeration ──────────────────────────────────────────────

/** Number of cells in a single range. */
export function rangeSize(range: SelectionRange): number {
  const norm = normalizeRange(range)
  return (norm.endRow - norm.startRow + 1) * (norm.endCol - norm.startCol + 1)
}

/** Total selected cells across all ranges (does not deduplicate overlaps). */
export function multiSelectionSize(state: MultiSelectionState): number {
  return rangeSize(state.primary) + state.additional.reduce((sum, r) => sum + rangeSize(r), 0)
}

/** Get all cell ids covered by a range. */
export function rangeToCellIds(range: SelectionRange, refToCell: (row: number, col: number) => string): string[] {
  const norm = normalizeRange(range)
  const ids: string[] = []
  for (let r = norm.startRow; r <= norm.endRow; r++) {
    for (let c = norm.startCol; c <= norm.endCol; c++) {
      ids.push(refToCell(r, c))
    }
  }
  return ids
}

/** Get all cell ids from multi-selection (deduplicates overlapping cells). */
export function multiSelectionToCellIds(
  state: MultiSelectionState,
  refToCell: (row: number, col: number) => string,
): string[] {
  const set = new Set<string>()
  const allRanges = [state.primary, ...state.additional]
  for (const range of allRanges) {
    const norm = normalizeRange(range)
    for (let r = norm.startRow; r <= norm.endRow; r++) {
      for (let c = norm.startCol; c <= norm.endCol; c++) {
        set.add(refToCell(r, c))
      }
    }
  }
  return Array.from(set)
}

// ─── Range overlap / merge ──────────────────────────────────────────────────

/** Do two ranges overlap? */
export function rangesOverlap(a: SelectionRange, b: SelectionRange): boolean {
  const an = normalizeRange(a)
  const bn = normalizeRange(b)
  return an.startRow <= bn.endRow && an.endRow >= bn.startRow &&
    an.startCol <= bn.endCol && an.endCol >= bn.startCol
}

/** Convert a Selection to our SelectionRange (same shape, just a type alias). */
export function selectionToRange(sel: Selection): SelectionRange {
  return { startRow: sel.startRow, startCol: sel.startCol, endRow: sel.endRow, endCol: sel.endCol }
}

/** Convert a SelectionRange to Selection (for backward compat). */
export function rangeToSelection(range: SelectionRange): Selection {
  return { startRow: range.startRow, startCol: range.startCol, endRow: range.endRow, endCol: range.endCol }
}
