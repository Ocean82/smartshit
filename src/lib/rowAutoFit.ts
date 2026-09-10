/**
 * Auto-fit row heights for cells with textWrap enabled.
 *
 * Measurement is pure (injectable width measurer) so unit tests don't need a
 * canvas. The browser store path uses canvas measureText; Node tests use a
 * fixed character-width estimate.
 */

import type { CellData } from '@/types'
import { cellToRef } from '@/engine/spreadsheet'
import { DEFAULT_CELL_WIDTH } from '@/lib/layoutConstants'
import { isWrapEnabled } from '@/lib/cellFormat'
import {
  DEFAULT_ROW_HEIGHT,
  clampRowHeight,
  setRowAt,
} from '@/lib/rowLayout'

/** Horizontal padding matching GridCell `px-1.5` (6px each side). */
export const CELL_PAD_X = 12

/** Default font size when CellFormat.fontSize is unset (matches GridCell). */
export const DEFAULT_FONT_SIZE = 13

/** Line box for the default 13px font (`leading-[18px]` in GridCell). */
export const DEFAULT_LINE_HEIGHT = 18

/** Small vertical padding inside the cell content box. */
const CELL_PAD_Y = 4

export function lineHeightForFontSize(fontSize: number): number {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : DEFAULT_FONT_SIZE
  return Math.max(14, Math.round(size * (DEFAULT_LINE_HEIGHT / DEFAULT_FONT_SIZE)))
}

/**
 * Greedy word wrap. Soft-wraps on whitespace; hard-breaks tokens wider than
 * `maxWidth` (approximates CSS `break-words`).
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  measureWidth: (s: string) => number,
): string[] {
  if (maxWidth <= 0) return text.length ? [text] : ['']
  const paragraphs = String(text).split(/\r?\n/)
  const lines: string[] = []

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push('')
      continue
    }

    const tokens = para.split(/(\s+)/)
    let current = ''

    const pushHardBroken = (token: string) => {
      let rest = token
      while (rest.length > 0) {
        if (measureWidth(rest) <= maxWidth) {
          current = rest
          return
        }
        let lo = 1
        let hi = rest.length
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1
          if (measureWidth(rest.slice(0, mid)) <= maxWidth) lo = mid
          else hi = mid - 1
        }
        const take = Math.max(1, lo)
        lines.push(rest.slice(0, take))
        rest = rest.slice(take)
        current = ''
      }
    }

    for (const token of tokens) {
      if (!token) continue
      const trial = current + token
      if (measureWidth(trial) <= maxWidth) {
        current = trial
        continue
      }
      if (current) lines.push(current)
      current = ''
      if (measureWidth(token) <= maxWidth) {
        current = token.replace(/^\s+/, '')
        // Leading whitespace-only tokens that don't fit after a break can be dropped.
        if (current.length === 0 && /^\s+$/.test(token)) continue
        if (current.length === 0) current = token
      } else {
        pushHardBroken(token.replace(/^\s+/, '') || token)
      }
    }
    if (current) lines.push(current)
  }

  return lines.length > 0 ? lines : ['']
}

export function measureWrappedHeight(args: {
  text: string
  contentWidth: number
  fontSize?: number
  measureWidth: (text: string, fontSize: number) => number
}): number {
  const fontSize = args.fontSize && args.fontSize > 0 ? args.fontSize : DEFAULT_FONT_SIZE
  const lh = lineHeightForFontSize(fontSize)
  const width = Math.max(1, args.contentWidth)
  const lines = wrapTextLines(args.text, width, (s) => args.measureWidth(s, fontSize))
  return clampRowHeight(lines.length * lh + CELL_PAD_Y)
}

export type TextMeasurer = (text: string, fontSize: number, fontFamily?: string) => number

/** Canvas-backed measurer for the browser; falls back to a glyph-width estimate. */
export function createCanvasTextMeasurer(): TextMeasurer {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const ctx = canvas?.getContext('2d') ?? null
  const fallbackFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

  return (text, fontSize, fontFamily) => {
    if (!ctx) return Math.ceil(Math.max(0, text.length) * fontSize * 0.55)
    ctx.font = `${fontSize}px ${fontFamily && fontFamily !== 'System' ? fontFamily : fallbackFamily}`
    return ctx.measureText(text).width
  }
}

export interface AutoFitSheetSlice {
  cells: Record<string, CellData>
  columnWidths: Record<number, number>
  rowHeights: Record<number, number>
}

/**
 * Return a new rowHeights map with autofit applied to `rows`.
 * Only rows that contain at least one wrapped cell are updated.
 * Height is the max needed across wrapped cells in that row (never below default).
 */
export function autoFitRowHeights(
  sheet: AutoFitSheetSlice,
  rows: Iterable<number>,
  getDisplayText: (row: number, col: number) => string,
  measureWidth: TextMeasurer = createCanvasTextMeasurer(),
): Record<number, number> {
  let next = { ...sheet.rowHeights }

  for (const row of new Set(rows)) {
    if (row < 0 || !Number.isFinite(row)) continue
    let needed = DEFAULT_ROW_HEIGHT
    let hasWrap = false

    for (const [cellId, cell] of Object.entries(sheet.cells)) {
      const ref = cellToRef(cellId)
      if (ref.row !== row) continue
      if (!isWrapEnabled(cell.format)) continue
      hasWrap = true
      const text = getDisplayText(ref.row, ref.col)
      if (!text) continue
      const colWidth = sheet.columnWidths[ref.col] || DEFAULT_CELL_WIDTH
      const contentWidth = Math.max(1, colWidth - CELL_PAD_X)
      const fontSize = cell.format?.fontSize
      const h = measureWrappedHeight({
        text,
        contentWidth,
        fontSize,
        measureWidth: (t, fs) => measureWidth(t, fs, cell.format?.fontFamily),
      })
      if (h > needed) needed = h
    }

    if (hasWrap) next = setRowAt(next, row, needed)
  }

  return next
}
