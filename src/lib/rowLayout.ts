/**
 * Pure row-layout helpers for the virtualized grid.
 *
 * Row heights are stored on the sheet as a sparse map of pixel overrides
 * (`sheet.rowHeights`, e.g. imported from .xlsx via `!rows`). Rows without an
 * override render at the default height. All vertical geometry — total height,
 * visible-range lookup, scroll-to-cell, and selection rects — is derived from
 * these helpers so the grid, overlay, and touch handling share one source of
 * truth.
 */

/** Default height (px) of every row with no explicit override. */
export const DEFAULT_ROW_HEIGHT = 28

/** Pixel height of a single row, honoring a positive explicit override. */
export function getRowHeight(rowHeights: Record<number, number>, row: number): number {
  const override = rowHeights[row]
  if (typeof override === 'number' && override > 0) return Math.round(override)
  return DEFAULT_ROW_HEIGHT
}

/** Per-row pixel heights for rows [0, count). */
export function rowHeightsArray(rowHeights: Record<number, number>, count: number): number[] {
  const out: number[] = new Array(count)
  for (let r = 0; r < count; r++) out[r] = getRowHeight(rowHeights, r)
  return out
}

/**
 * Cumulative top offsets for a list of row heights.
 * `offsets[i]` is the top (px) of row i; `offsets[heights.length]` is the total
 * height. Length is always `heights.length + 1`.
 */
export function rowCumulativeOffsets(heights: number[]): number[] {
  const offsets: number[] = new Array(heights.length + 1)
  let acc = 0
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = acc
    acc += heights[i]
  }
  offsets[heights.length] = acc
  return offsets
}

/**
 * Given cumulative row offsets and a pixel Y, return the index of the row that
 * contains that pixel (row i occupies [offsets[i], offsets[i+1])). Clamped to
 * the last row when `pixelY` is at/above the total height.
 */
export function rowIndexAtY(offsets: number[], pixelY: number): number {
  const count = offsets.length - 1
  if (count <= 0) return 0
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= pixelY) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Minimum pixel height a row can be resized to. */
export const MIN_ROW_HEIGHT = 20

/** Maximum pixel height a row can be resized to. */
export const MAX_ROW_HEIGHT = 400

/**
 * Clamp a proposed pixel height into [MIN_ROW_HEIGHT, MAX_ROW_HEIGHT],
 * rounding to a whole pixel. Non-finite input falls back to the default.
 */
export function clampRowHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_ROW_HEIGHT
  return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(height)))
}

/**
 * Return a new rowHeights map with `row` set to the clamped height.
 * The input map is not mutated.
 */
export function setRowAt(rowHeights: Record<number, number>, row: number, height: number): Record<number, number> {
  const next = { ...rowHeights }
  next[row] = clampRowHeight(height)
  return next
}
