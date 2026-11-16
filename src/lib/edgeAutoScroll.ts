/**
 * Edge auto-scroll for drag-selecting: while the button is held near or past
 * an edge of the grid, scroll toward it. Speed grows with distance past the
 * inner margin, so a small nudge creeps and a big overshoot moves fast.
 */

/** Pixels from an edge where auto-scroll starts. */
export const EDGE_MARGIN = 32
/** Fastest scroll, in pixels per frame (~2,400 px/s at 60 fps). */
export const MAX_STEP = 40

/**
 * Scroll step along one axis for pointer position `pos` in a visible span
 * [`min`, `max`]: negative toward `min`, positive toward `max`, 0 in between.
 */
export function edgeScrollStep(pos: number, min: number, max: number, margin = EDGE_MARGIN, maxStep = MAX_STEP): number {
  if (pos < min + margin) return -Math.min(maxStep, Math.ceil((min + margin - pos) / 2))
  if (pos > max - margin) return Math.min(maxStep, Math.ceil((pos - (max - margin)) / 2))
  return 0
}
