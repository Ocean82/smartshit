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
