/**
 * Formatting tool handlers: format_cells, format_as_table, style_recipe
 */
import { applyFormatCells } from '@/lib/formatCellsTool'
import { formatAsTable } from '@/lib/formatAsTable'
import { buildRecipePlan, isStyleRecipe, planChangeCount, STYLE_RECIPES } from '@/lib/styleRecipes'
import type { ToolHandler } from './types'

export const handleFormatCells: ToolHandler = (params, ctx, _sheet) => {
  return applyFormatCells(params, ctx)
}

const RECIPE_LABELS: Record<string, string> = {
  header: 'header row',
  total_row: 'total row',
  table_polish: 'table polish',
}

export const handleStyleRecipe: ToolHandler = (params, ctx, sheet) => {
  const recipe = params.recipe
  if (!isStyleRecipe(recipe)) {
    return {
      success: false,
      message: `style_recipe needs a "recipe" of: ${STYLE_RECIPES.join(', ')}`,
      modified: 0,
    }
  }
  const theme = typeof params.theme === 'string' ? params.theme : 'blue'
  const plan = buildRecipePlan(recipe, sheet, ctx.getComputedValue, theme)
  if (!plan) {
    const why = recipe === 'total_row'
      ? 'No numeric columns found to total.'
      : 'Could not detect a data range to style.'
    return { success: false, message: why, modified: 0 }
  }

  ctx.pushHistory(`Style recipe: ${RECIPE_LABELS[recipe] ?? recipe}`)

  // Value/formula writes first (total_row), then formats layered on top.
  if (Object.keys(plan.cellUpdates).length > 0) ctx.bulkSetCells(plan.cellUpdates)
  for (const [cellId, fmt] of Object.entries(plan.formatUpdates)) ctx.setCellFormat(cellId, fmt)
  if (plan.filters.length > 0) ctx.setFilters(plan.filters.map((column) => ({ column })))

  const count = planChangeCount(plan)
  return {
    success: true,
    message: `Applied ${RECIPE_LABELS[recipe] ?? recipe} styling to ${count} cell${count === 1 ? '' : 's'}`,
    modified: count,
  }
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
