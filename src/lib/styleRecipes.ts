/**
 * Style recipes (P1.4) — bounded, one-shot formatting macros.
 *
 * Each recipe resolves to a plan of format updates + optional cell writes,
 * computed from the detected table range. The same plan drives both the
 * Apply/Reject preview and execution, so what the user reviews is exactly
 * what runs. Recipes reuse the existing formatAsTable / generateTableTotals
 * building blocks rather than re-implementing table styling.
 */
import type { CellChange, CellFormat, SheetData } from '@/types'
import { cellToRef, refToCell } from '@/engine/spreadsheet'
import {
  TABLE_THEMES,
  detectTableRange,
  formatAsTable,
  generateTableTotals,
  type DetectedTableRange,
} from '@/lib/formatAsTable'

export type StyleRecipe = 'header' | 'total_row' | 'table_polish'

export const STYLE_RECIPES: StyleRecipe[] = ['header', 'total_row', 'table_polish']

export function isStyleRecipe(v: unknown): v is StyleRecipe {
  return typeof v === 'string' && (STYLE_RECIPES as string[]).includes(v)
}

export interface RecipePlan {
  /** Format-only updates keyed by cell id. */
  formatUpdates: Record<string, Partial<CellFormat>>
  /** Value/formula writes keyed by cell id (used by total_row). */
  cellUpdates: Record<string, { value: string | number | boolean | null; formula?: string }>
  /** Column filters to attach (table_polish only). */
  filters: number[]
  range: DetectedTableRange
}

/** Build the recipe plan, or null when there's no detectable data range. */
export function buildRecipePlan(
  recipe: StyleRecipe,
  sheet: SheetData,
  getComputedValue: (row: number, col: number) => string,
  theme = 'blue',
): RecipePlan | null {
  const range = detectTableRange(sheet, getComputedValue)
  if (!range) return null

  const formatUpdates: Record<string, Partial<CellFormat>> = {}
  const cellUpdates: Record<string, { value: string | number | boolean | null; formula?: string }> = {}
  let filters: number[] = []

  if (recipe === 'header') {
    const t = TABLE_THEMES[theme] ?? TABLE_THEMES.blue
    for (let c = range.startCol; c <= range.endCol; c++) {
      formatUpdates[refToCell(range.headerRow, c)] = {
        bold: true,
        bgColor: t.headerBg,
        fontColor: t.headerFontColor,
        borders: { bottom: `2px solid ${t.accentColor}` },
      }
    }
  } else if (recipe === 'table_polish') {
    const result = formatAsTable(sheet, getComputedValue, theme, range)
    if (!result) return null
    Object.assign(formatUpdates, result.formatUpdates)
    filters = result.filters.map((f) => f.column)
  } else {
    // total_row
    const totals = generateTableTotals(sheet, range, getComputedValue)
    if (!totals) return null
    const t = TABLE_THEMES[theme] ?? TABLE_THEMES.blue
    for (const [cellId, data] of Object.entries(totals)) {
      cellUpdates[cellId] = { value: data.value ?? null, formula: data.formula }
      formatUpdates[cellId] = { bold: true, borders: { top: `2px solid ${t.accentColor}` } }
    }
  }

  return { formatUpdates, cellUpdates, filters, range }
}

/** Flatten a plan into CellChange[] for the Apply/Reject preview. */
export function planToPreviewChanges(plan: RecipePlan, sheet: SheetData): CellChange[] {
  const ids = new Set([...Object.keys(plan.cellUpdates), ...Object.keys(plan.formatUpdates)])
  const changes: CellChange[] = []
  for (const cellId of ids) {
    const current = sheet.cells[cellId]
    const write = plan.cellUpdates[cellId]
    changes.push({
      cell: cellId,
      oldValue: current?.value ?? null,
      newValue: write && write.formula == null ? (write.value ?? null) : null,
      oldFormula: current?.formula,
      newFormula: write?.formula,
    })
  }
  return changes
}

/** Count total cells a plan touches (format + value writes, de-duplicated). */
export function planChangeCount(plan: RecipePlan): number {
  return new Set([...Object.keys(plan.cellUpdates), ...Object.keys(plan.formatUpdates)]).size
}

// Re-export for handler convenience.
export { cellToRef }
