/**
 * Read-only query tool handlers: count_rows, find_max, find_min, formula_analyzer
 */
import type { SheetData } from '@/types'
import { cellToRef } from '@/engine/spreadsheet'
import { findHeaderRow, findLastDataRow } from '@/lib/sheetSort'
import { findSummaryRowIndexes } from '@/lib/sheetRows'
import type { ToolHandler } from './types'
import { requireCellRef, requireColumn, resolveColumnIndex } from './types'

export const handleFormulaAnalyzer: ToolHandler = (params, ctx, sheet) => {
  const cell = requireCellRef(params.cell, 'formula_analyzer')
  if ('error' in cell) return cell.error

  const ref = cellToRef(cell.ref)
  const cellData = sheet.cells[cell.ref]
  if (!cellData?.formula) {
    return {
      success: false,
      message: `No formula found in ${cell.ref}. Current value: "${ctx.getComputedValue(ref.row, ref.col)}"`,
      modified: 0,
    }
  }
  return { success: true, message: `Formula in ${cell.ref}: ${cellData.formula}`, modified: 0 }
}

export const handleCountRows: ToolHandler = (params, ctx, sheet) => {
  const rawColumn = String(params.column ?? '').trim()
  const colIdx = rawColumn ? resolveColumnIndex(rawColumn, sheet, ctx.getComputedValue) : null
  if (rawColumn && colIdx == null) {
    return { success: false, message: `Could not find column "${rawColumn}"`, modified: 0 }
  }

  const operator = String(params.operator ?? 'equals').toLowerCase()
  const supported = new Set(['equals', 'contains', 'gt', 'gte', 'lt', 'lte', 'not_empty'])
  if (!supported.has(operator)) {
    return { success: false, message: `Unsupported count condition "${operator}"`, modified: 0 }
  }
  if (operator !== 'not_empty' && params.value == null) {
    return { success: false, message: 'count_rows requires a comparison value', modified: 0 }
  }

  const matchingRows = queryMatchingRows(sheet, ctx, colIdx, operator, params.value)

  const scope = rawColumn ? ` in ${rawColumn}` : ''
  const rows = matchingRows.length > 0
    ? ` (rows ${matchingRows.slice(0, 8).join(', ')}${matchingRows.length > 8 ? ', …' : ''})`
    : ''
  return {
    success: true,
    message: `Found ${matchingRows.length} matching row${matchingRows.length === 1 ? '' : 's'}${scope}${rows}`,
    modified: 0,
  }
}

export const handleFindMax: ToolHandler = (params, ctx, sheet) => {
  return findExtreme(params, ctx, sheet, 'max')
}

export const handleFindMin: ToolHandler = (params, ctx, sheet) => {
  return findExtreme(params, ctx, sheet, 'min')
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Scan rows matching a condition. Returns 1-based row numbers. */
function queryMatchingRows(
  sheet: SheetData,
  ctx: { getComputedValue: (row: number, col: number) => string },
  colIdx: number | null,
  operator: string,
  rawTarget: unknown,
): number[] {
  const headerRow = findHeaderRow(sheet)
  const lastRow = findLastDataRow(sheet)
  const summaryRows = findSummaryRowIndexes(sheet, ctx.getComputedValue)

  let maxCol = 0
  for (const cellId of Object.keys(sheet.cells)) maxCol = Math.max(maxCol, cellToRef(cellId).col)

  const matchingRows: number[] = []
  for (let row = headerRow + 1; row <= lastRow; row++) {
    if (summaryRows.has(row)) continue
    const columns = colIdx == null
      ? Array.from({ length: maxCol + 1 }, (_, i) => i)
      : [colIdx]

    if (columns.some((col) => countValueMatches(ctx.getComputedValue(row, col), operator, rawTarget))) {
      matchingRows.push(row + 1)
    }
  }
  return matchingRows
}

/** Find the extreme (max or min) value in a column. */
function findExtreme(
  params: Record<string, unknown>,
  ctx: { getComputedValue: (row: number, col: number, sheetId?: string) => string },
  sheet: SheetData,
  direction: 'max' | 'min',
) {
  const tool = direction === 'max' ? 'find_max' : 'find_min'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ctx is narrowed here but requireColumn only uses getComputedValue
  const col = requireColumn(params.column, sheet, ctx as any, tool)
  if ('error' in col) return col.error

  const colIdx = col.index
  const isMax = direction === 'max'
  const headerRow = findHeaderRow(sheet)
  const summaryRows = findSummaryRowIndexes(sheet, ctx.getComputedValue)
  let best: { val: number; row: number; label: string } | null = null

  for (const cellId of Object.keys(sheet.cells)) {
    const ref = cellToRef(cellId)
    if (ref.col !== colIdx || ref.row <= headerRow || summaryRows.has(ref.row)) continue
    const computed = ctx.getComputedValue(ref.row, ref.col)
    const num = parseFloat(computed.replace(/[$,]/g, ''))
    if (isNaN(num)) continue
    if (!best || (isMax ? num > best.val : num < best.val)) {
      const label = ctx.getComputedValue(ref.row, 0) || `Row ${ref.row + 1}`
      best = { val: num, row: ref.row, label }
    }
  }

  if (best) {
    const desc = isMax ? 'highest' : 'lowest'
    const header = ctx.getComputedValue(headerRow, colIdx)
    const isCurrency = /amount|expense|cost|price|total|spent|budget|income|revenue|salary/i.test(header)
    const formatted = `${isCurrency ? '$' : ''}${best.val.toLocaleString()}`
    return {
      success: true,
      message: `The ${desc} value in column ${col.label} is ${formatted} (${best.label}, row ${best.row + 1})`,
      modified: 0,
    }
  }
  return { success: false, message: `No numeric values found in column ${col.label}`, modified: 0 }
}

/** Match a displayed cell value against an operator and target. */
function countValueMatches(displayed: string, operator: string, rawTarget: unknown): boolean {
  const value = displayed.trim()
  if (operator === 'not_empty') return value !== ''

  const targetText = String(rawTarget ?? '').trim()
  if (operator === 'contains') return value.toLowerCase().includes(targetText.toLowerCase())
  if (operator === 'equals') {
    const leftNumber = Number(value.replace(/[$,%\s]/g, ''))
    const rightNumber = Number(targetText.replace(/[$,%\s]/g, ''))
    if (value !== '' && targetText !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber === rightNumber
    }
    return value.toLowerCase() === targetText.toLowerCase()
  }

  const left = Number(value.replace(/[$,%\s]/g, ''))
  const right = Number(targetText.replace(/[$,%\s]/g, ''))
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false
  switch (operator) {
    case 'gt': return left > right
    case 'gte': return left >= right
    case 'lt': return left < right
    case 'lte': return left <= right
    default: return false
  }
}
