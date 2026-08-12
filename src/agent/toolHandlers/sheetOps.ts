/**
 * Sheet-level tool handlers: clear_sheet, rename_sheet, sort_sheet, multi_sort
 */
import type { SheetData } from '@/types'
import { computeSortedCellUpdates, computeMultiSortedCellUpdates } from '@/lib/sheetSort'
import type { ToolHandler, BulkUpdates } from './types'
import { applyBulk, requireColumn, resolveColumnIndex } from './types'

export const handleClearSheet: ToolHandler = (params, ctx, sheet) => {
  ctx.pushHistory('Clear sheet')
  const cellIds = Object.keys(sheet.cells)
  const updates: BulkUpdates = {}
  for (const cellId of cellIds) {
    updates[cellId] = { value: null }
  }
  const count = applyBulk(ctx, updates)
  return { success: true, message: 'Sheet cleared', modified: count }
}

export const handleRenameSheet: ToolHandler = (params, ctx, sheet) => {
  const name = String(params.name ?? '').trim()
  if (!name) {
    return { success: false, message: 'rename_sheet requires a "name"', modified: 0 }
  }
  ctx.renameSheet(sheet.id, name)
  return { success: true, message: `Sheet renamed to "${name}"`, modified: 0 }
}

export const handleSortSheet: ToolHandler = (params, ctx, sheet) => {
  const col = requireColumn(params.column, sheet, ctx, 'sort_sheet')
  if ('error' in col) return col.error

  const direction = ((params.direction as string) || 'asc') === 'desc' ? 'desc' : 'asc'
  ctx.pushHistory(`Sort by column ${col.label}`)

  const patch = computeSortedCellUpdates(sheet, col.index, direction, ctx.getComputedValue)
  ctx.applySortPatch(patch)
  const count = Object.keys(patch.writes).length + patch.deletes.length

  return { success: true, message: `Sorted rows by column ${col.label} (${direction})`, modified: count }
}

export const handleMultiSort: ToolHandler = (params, ctx, sheet) => {
  const rules = params.rules as Array<{ column: string; direction?: string }>
  if (!Array.isArray(rules) || rules.length === 0) {
    return { success: false, message: 'multi_sort requires a rules array', modified: 0 }
  }

  const sortRules = rules.flatMap((rule) => {
    const column = resolveColumnIndex(String(rule.column), sheet, ctx.getComputedValue)
    if (column == null) return []
    return [{
      column,
      direction: (rule.direction === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
    }]
  })

  if (sortRules.length !== rules.length) {
    const unresolved = rules
      .filter((rule) => resolveColumnIndex(String(rule.column), sheet, ctx.getComputedValue) == null)
      .map((rule) => String(rule.column))
    return {
      success: false,
      message: `Could not resolve multi-sort column${unresolved.length === 1 ? '' : 's'}: ${unresolved.join(', ')}`,
      modified: 0,
    }
  }

  ctx.pushHistory(`Multi-sort by ${sortRules.length} column(s)`)
  const patch = computeMultiSortedCellUpdates(sheet, sortRules, ctx.getComputedValue)
  ctx.applySortPatch(patch)
  const count = Object.keys(patch.writes).length + patch.deletes.length
  return { success: true, message: `Sorted by ${sortRules.length} column(s)`, modified: count }
}
