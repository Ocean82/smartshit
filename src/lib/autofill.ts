/**
 * Pure fill-handle engine for Excel-style autofill. No DOM/store access.
 * Pattern detection happens per one-dimensional source strip; the store
 * extends strips horizontally then vertically so diagonal fills compound
 * correctly.
 */
import type { CellData, CellFormat } from '@/types'
import { colToLetter, letterToCol } from '@/engine/spreadsheet'
import { rowIndexAtY } from '@/lib/rowLayout'

/** Shift relative (non-$) A1 references in a formula by row/col deltas. */
const A1_REF_RE = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g

export function adjustFormulaRefs(formula: string, deltaRow: number, deltaCol: number): string {
  return formula.replace(A1_REF_RE, (_m, colAbs: string, colStr: string, rowAbs: string, rowStr: string) => {
    const newCol = colAbs ? colStr : colToLetter(letterToCol(colStr) + deltaCol)
    const newRow = rowAbs ? rowStr : String(parseInt(rowStr, 10) + deltaRow)
    return `${colAbs}${newCol}${rowAbs}${newRow}`
  })
}

export interface PointToCellRef {
  gridLeft: number
  gridTop: number
  scrollLeft: number
  scrollTop: number
  rowHeaderWidth: number
  colHeaderHeight: number
  rowOffsets: number[]
  colOffsets: number[]
  totalRows: number
  totalCols: number
}

/** Map a viewport client point to the cell under it (content space minus headers + scroll). */
export function pointToCell(clientX: number, clientY: number, ref: PointToCellRef): { row: number; col: number } {
  const contentX = clientX - ref.gridLeft + ref.scrollLeft - ref.rowHeaderWidth
  const contentY = clientY - ref.gridTop + ref.scrollTop - ref.colHeaderHeight
  const row = contentY <= 0 ? 0 : Math.min(ref.totalRows - 1, rowIndexAtY(ref.rowOffsets, contentY))
  const col = contentX <= 0 ? 0 : Math.min(ref.totalCols - 1, rowIndexAtY(ref.colOffsets, contentX))
  return { row, col }
}

/** `len` = number of populated source cells, so `k` is anchored past the source edge. */
export type FillPattern =
  | { kind: 'blank' }
  | { kind: 'linear'; start: number; step: number; len: number; format?: CellFormat }
  | { kind: 'date'; start: number; step: number; len: number; format?: CellFormat }
  | { kind: 'textNumber'; prefix: string; suffix: string; startNum: number; step: number; len: number; format?: CellFormat }
  | { kind: 'repeat'; strip: Array<CellData | undefined> }

export interface FilledCell {
  value: string | number | boolean | null
  formula?: string
  format?: CellFormat
  hyperlink?: CellData['hyperlink']
  /** Index into the source strip this filled cell derives from (formula deltas). */
  sourceStripIndex: number
}

const DATE_FORMATS = new Set(['date', 'date-iso', 'date-long', 'date-short-eu', 'date-mmm-yy', 'date-d-mmm'])

function isDateCell(cell: CellData | undefined): boolean {
  const nf = cell?.format?.numberFormat
  return !!nf && DATE_FORMATS.has(nf)
}

/** Split "Item 7 (x)" → { prefix: 'Item ', num: 7, suffix: ' (x)' }. Null if no trailing number. */
export function splitTrailingNumber(text: string): { prefix: string; num: number; suffix: string } | null {
  const m = /^(.*?)(-?\d+(?:\.\d+)?)(.*)$/.exec(text)
  if (!m) return null
  return { prefix: m[1], num: Number(m[2]), suffix: m[3] }
}

/** Detect the autofill pattern of a one-dimensional source strip. */
export function buildFillPattern(strip: Array<CellData | undefined>): FillPattern {
  const populated = strip.filter((c): c is CellData => !!c)
  if (populated.length === 0) return { kind: 'blank' }
  const first = populated[0]

  // Any formula → repeat the block verbatim (store adjusts refs per target cell).
  if (populated.some((c) => c.formula)) return { kind: 'repeat', strip }

  const anyBool = populated.some((c) => typeof c.value === 'boolean')
  const allNumeric = populated.every((c) => typeof c.value === 'number')
  if (!anyBool && allNumeric) {
    const vals = populated.map((c) => c.value as number)
    const fmt = first.format
    if (vals.length === 1) {
      return isDateCell(first)
        ? { kind: 'date', start: vals[0], step: 1, len: 1, format: fmt }
        : { kind: 'linear', start: vals[0], step: 0, len: 1, format: fmt }
    }
    const step = vals[1] - vals[0]
    const constant = vals.every((v, i) => i === 0 || Math.abs(v - (vals[0] + step * i)) < 1e-9)
    if (constant) {
      return isDateCell(first)
        ? { kind: 'date', start: vals[0], step, len: vals.length, format: fmt }
        : { kind: 'linear', start: vals[0], step, len: vals.length, format: fmt }
    }
    return { kind: 'repeat', strip }
  }

  const allText = populated.every((c) => typeof c.value === 'string')
  if (allText) {
    const cells = populated as Array<CellData & { value: string }>
    const parts = cells.map((c) => splitTrailingNumber(c.value))
    if (parts.every((p) => p !== null)) {
      const ps = parts as Array<{ prefix: string; num: number; suffix: string }>
      if (ps.every((p) => p.prefix === ps[0].prefix && p.suffix === ps[0].suffix)) {
        const step = ps.length > 1 ? ps[1].num - ps[0].num : 1
        const constant = ps.every((p, i) => i === 0 || Math.abs((p.num - ps[0].num) - step * i) < 1e-9)
        if (constant) {
          return { kind: 'textNumber', prefix: ps[0].prefix, suffix: ps[0].suffix, startNum: ps[0].num, step, len: ps.length, format: first.format }
        }
      }
    }
  }

  return { kind: 'repeat', strip }
}

/** Value/formula/format for the `k`-th filled cell (k = 1 past the source edge). */
export function fillCellAt(pattern: FillPattern, k: number): FilledCell | null {
  switch (pattern.kind) {
    case 'blank':
      return null
    case 'repeat': {
      if (pattern.strip.length === 0) return null
      const idx = (k - 1) % pattern.strip.length
      const src = pattern.strip[idx]
      if (!src) return null
      return {
        value: src.value ?? null,
        formula: src.formula,
        format: src.format,
        hyperlink: src.hyperlink,
        sourceStripIndex: idx,
      }
    }
    case 'linear':
      return { value: pattern.start + pattern.step * (pattern.len - 1 + k), format: pattern.format, sourceStripIndex: 0 }
    case 'date':
      return { value: pattern.start + pattern.step * (pattern.len - 1 + k), format: pattern.format, sourceStripIndex: 0 }
    case 'textNumber':
      return { value: `${pattern.prefix}${pattern.startNum + pattern.step * (pattern.len - 1 + k)}${pattern.suffix}`, format: pattern.format, sourceStripIndex: 0 }
  }
}