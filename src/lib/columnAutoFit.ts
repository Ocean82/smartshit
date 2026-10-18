/**
 * Auto-fit column widths to natural (single-line, unwrapped) content width.
 *
 * The column dual of rowAutoFit: where row-fit measures WRAPPED height, column
 * fit measures the NATURAL width of each cell's display text (header + data),
 * takes the max, adds CELL_PAD_X, and clamps via colLayout's clampColWidth.
 *
 * Measurement is pure (injectable width measurer) so unit tests don't need a
 * canvas — reusing the SAME TextMeasurer / createCanvasTextMeasurer as the row
 * path (do not duplicate the canvas measurer).
 */

import { cellToRef } from '@/engine/spreadsheet'
import { CELL_PAD_X, DEFAULT_FONT_SIZE, createCanvasTextMeasurer, type TextMeasurer } from '@/lib/rowAutoFit'
import { clampColWidth, getColWidth, setColAt } from '@/lib/colLayout'
import type { AutoFitSheetSlice } from '@/lib/rowAutoFit'

/**
 * Return a new columnWidths map with autofit applied to `cols`.
 * For each requested 0-indexed column, the width is the max natural (unwrapped)
 * display-text width across its cells (header + data) + CELL_PAD_X, clamped to
 * MIN_COL_WIDTH..MAX_COL_WIDTH. A column whose cells are all empty yields no
 * candidate and is left unchanged. Only columns whose clamped width differs
 * from the current width are written; the input map is never mutated.
 */
export function autoFitColumnWidths(
  sheet: AutoFitSheetSlice,
  cols: Iterable<number>,
  getDisplayText: (row: number, col: number) => string,
  measureWidth: TextMeasurer = createCanvasTextMeasurer(),
): Record<number, number> {
  let next = { ...sheet.columnWidths }

  for (const col of new Set(cols)) {
    if (col < 0 || !Number.isFinite(col)) continue
    let widest = 0

    for (const [cellId, cell] of Object.entries(sheet.cells)) {
      const ref = cellToRef(cellId)
      if (ref.col !== col) continue
      const text = getDisplayText(ref.row, ref.col)
      if (!text) continue
      const fontSize = cell.format?.fontSize && cell.format.fontSize > 0 ? cell.format.fontSize : DEFAULT_FONT_SIZE
      const w = measureWidth(text, fontSize, cell.format?.fontFamily)
      if (w > widest) widest = w
    }

    // No non-empty cell in this column — leave it unchanged.
    if (widest <= 0) continue

    const clamped = clampColWidth(widest + CELL_PAD_X)
    if (clamped !== getColWidth(sheet.columnWidths, col)) {
      next = setColAt(next, col, clamped)
    }
  }

  return next
}
