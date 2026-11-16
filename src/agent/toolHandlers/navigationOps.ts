/**
 * Read-only navigation: select_cells moves the selection and scrolls to it.
 * It never edits the sheet, so it records no history and needs no Apply.
 */
import type { ToolHandler } from './types'
import { navigationRequestFromParams, resolveNavigation } from '@/lib/navigation'

export const handleSelectCells: ToolHandler = (params, ctx, sheet) => {
  const request = navigationRequestFromParams(params)
  if (!request) {
    return {
      success: false,
      message: 'Tell me a cell (like C5), a range, a column or row, or a value to find.',
      modified: 0,
    }
  }
  const otherSheets = ctx.getSheets().filter((s) => s.id !== sheet.id)
  const outcome = resolveNavigation(request, sheet, ctx.getComputedValue, otherSheets)
  if (outcome.selections.length > 0) ctx.selectRanges?.(outcome.selections)
  return { success: outcome.selections.length > 0, message: outcome.message, modified: 0 }
}
