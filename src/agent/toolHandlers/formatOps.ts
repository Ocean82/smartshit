/**
 * Formatting tool handlers: format_cells, format_as_table
 */
import type { SheetData } from '@/types'
import { applyFormatCells } from '@/lib/formatCellsTool'
import { formatAsTable } from '@/lib/formatAsTable'
import type { ToolHandler } from './types'
import type { ExecutionContext } from '../executor'

export const handleFormatCells: ToolHandler = (params, ctx, _sheet) => {
  return applyFormatCells(params, ctx)
}

export const handleFormatAsTable: ToolHandler = (params, ctx, sheet) => {
  const theme = (params.theme as string) ?? 'blue'
  const result = formatAsTable(sheet, ctx.getComputedValue, theme)
  if (!result) {
    return { success: false, message: 'Could not detect a data range to format as table', modified: 0 }
  }

  ctx.pushHistory('Format as table')
  let count = 0
  for (const [cellId, fmt] of Object.entries(result.formatUpdates)) {
    ctx.setCellFormat(cellId, fmt)
    count++
  }
  ctx.setFilters(result.filters)
  return { success: true, message: `Formatted ${count} cells as a table (${theme} theme)`, modified: count }
}
