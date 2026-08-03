/**
 * Layout Constants — Shared breakpoints and spacing values.
 *
 * Centralizes responsive breakpoints so that JS-driven behavior and
 * CSS-driven behavior (via Tailwind's `md:` prefix) stay in sync.
 *
 * Tailwind's default `md` breakpoint is 768px. If you change the value
 * here, update tailwind.config (or the @theme layer in index.css) to match.
 */

/** Mobile breakpoint in pixels. Below this = phone layout. */
export const MOBILE_BREAKPOINT = 768

/** Standard cell height in the grid (px). */
export const CELL_HEIGHT = 28

/** Default column width when no override is set (px). */
export const DEFAULT_CELL_WIDTH = 100

/** Maximum rows the virtual grid can render. */
export const MAX_GRID_ROWS = 10_000

/** Maximum columns the virtual grid can render. */
export const MAX_GRID_COLS = 100
