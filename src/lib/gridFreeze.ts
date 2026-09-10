/**
 * Freeze-pane windowing helpers.
 *
 * Frozen rows/cols must stay in the DOM (for CSS sticky) while the
 * virtualized "body" window starts after the freeze line so those rows/cols
 * are not rendered twice.
 */

export function clampFreezeCount(count: number | null | undefined, max: number): number {
  if (count == null || !Number.isFinite(count) || count <= 0) return 0
  return Math.min(Math.floor(count), Math.max(0, max))
}

export interface FreezeBodyWindow {
  frozenRows: number
  frozenCols: number
  /** First non-frozen row index in the virtualized body. */
  bodyStartRow: number
  bodyEndRow: number
  bodyStartCol: number
  bodyEndCol: number
}

/**
 * Build the body virtualization window given a natural (scroll-derived) range
 * and freeze counts. Body start is never before the freeze line.
 */
export function computeFreezeBodyWindow(args: {
  frozenRows?: number | null
  frozenCols?: number | null
  naturalStartRow: number
  naturalEndRow: number
  naturalStartCol: number
  naturalEndCol: number
  displayRowCount: number
  totalCols: number
}): FreezeBodyWindow {
  const frozenRows = clampFreezeCount(args.frozenRows, args.displayRowCount)
  const frozenCols = clampFreezeCount(args.frozenCols, args.totalCols)
  const lastRow = Math.max(0, args.displayRowCount - 1)
  const lastCol = Math.max(0, args.totalCols - 1)

  const bodyStartRow = Math.min(lastRow + 1, Math.max(frozenRows, Math.max(0, args.naturalStartRow)))
  const bodyEndRow = Math.min(lastRow, Math.max(bodyStartRow - 1, args.naturalEndRow))
  // When everything is frozen, body is empty: start > end sentinel
  const safeBodyEndRow = bodyStartRow > lastRow ? bodyStartRow - 1 : Math.max(bodyStartRow, bodyEndRow)

  const bodyStartCol = Math.min(lastCol + 1, Math.max(frozenCols, Math.max(0, args.naturalStartCol)))
  const bodyEndCol = Math.min(lastCol, Math.max(bodyStartCol - 1, args.naturalEndCol))
  const safeBodyEndCol = bodyStartCol > lastCol ? bodyStartCol - 1 : Math.max(bodyStartCol, bodyEndCol)

  return {
    frozenRows,
    frozenCols,
    bodyStartRow,
    bodyEndRow: safeBodyEndRow,
    bodyStartCol,
    bodyEndCol: safeBodyEndCol,
  }
}

/** Pixel top offset for sticky frozen display-row `i` (below the col header). */
export function frozenRowStickyTop(colHeaderHeight: number, rowOffsets: number[], displayRow: number): number {
  if (displayRow <= 0) return colHeaderHeight
  const top = rowOffsets[displayRow] ?? 0
  return colHeaderHeight + top
}

/** Pixel left offset for sticky frozen col `c` (right of the row header). */
export function frozenColStickyLeft(rowHeaderWidth: number, getColWidth: (col: number) => number, col: number): number {
  let left = rowHeaderWidth
  for (let c = 0; c < col; c++) left += getColWidth(c)
  return left
}

/** Opaque sticky-pane fill: keep cell format/color-scale when set, else white. */
export function stickyPaneBackground(explicitBg?: string | null): string {
  const v = explicitBg?.trim()
  return v ? v : '#fff'
}
